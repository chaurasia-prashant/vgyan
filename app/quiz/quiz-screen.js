import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, 
  ScrollView, Alert, ActivityIndicator, BackHandler, Modal
} from 'react-native';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { readAsStringAsync } from 'expo-file-system/legacy';
import { getSafeRootDir } from '../../utils/fileManager';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MathRenderer from '../../components/MathRenderer';
import { updateLiveTestAnalytics, updateSubjectiveAnalytics, updateActivityMinutes } from '../../utils/analyticsManager';
import { syncAppStatus, GITHUB_USERNAME, REPO_NAME } from '../../utils/syncService';

const REMOTE_IMAGE_BASE = `https://api.github.com/repos/${GITHUB_USERNAME}/${REPO_NAME}/contents/exam_question_images/`;

export default function QuizScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { category, fileName, mode, timeLimit, isLive } = useLocalSearchParams();
  
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState(0);
  const [perQuestionTimer, setPerQuestionTimer] = useState(60);
  const [startTime] = useState(Date.now());
  const [sessionStartTime] = useState(Date.now());
  const [exitModalVisible, setExitModalVisible] = useState(false);
  const [githubToken, setGithubToken] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    const fetchToken = async () => {
      const token = await AsyncStorage.getItem('github_token');
      setGithubToken(token);
    };
    fetchToken();
    loadData();
    if (mode === 'practice') {
      setTimeLeft(parseInt(timeLimit || 60) * 60);
    }

    navigation.setOptions({
      headerLeft: () => null,
      gestureEnabled: false,
      headerTitle: () => (
        <Text style={styles.headerTitle}>EXAM SESSION</Text>
      ),
      headerTitleAlign: 'center',
    });

    const onBackPress = () => {
      setExitModalVisible(true);
      return true;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => backHandler.remove();
  }, [navigation]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ y: 0, animated: false });
    }
  }, [currentIndex]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (mode === 'speed') {
        if (perQuestionTimer <= 1) {
          handleNext();
        } else {
          setPerQuestionTimer(prev => prev - 1);
        }
      } else if (mode === 'practice') {
        if (timeLeft <= 1) {
          handleFinish();
        } else {
          setTimeLeft(prev => prev - 1);
        }
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [perQuestionTimer, timeLeft, mode]);

  const loadData = async () => {
    let root = getSafeRootDir();
    if (isLive === 'true') {
      root = root.replace('ExamList/', 'LiveTest/');
    }

    try {
      const content = await readAsStringAsync(`${root}${category}/${fileName}`);
      if (!content || !content.trim()) {
        throw new Error("Empty quiz file.");
      }
      const data = JSON.parse(content.replace(/^\uFEFF/, '').trim());
      
      const qArray = data.questions || (Array.isArray(data) ? data : []);
      
      if (qArray.length === 0) {
        Alert.alert("Empty Quiz", "This quiz file contains no questions.");
        router.back();
        return;
      }
      
      setQuestions(qArray);
    } catch (e) {
      Alert.alert("Load Error", "The quiz file is corrupted or missing.");
      router.back();
    } finally {
      setIsLoading(false);
    }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setPerQuestionTimer(60);
    } else {
      handleFinish();
    }
  };

  const handleFinish = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    let overallCorrect = 0;
    let overallAttempted = 0;
    let sectionsData = {};

    questions.forEach((q, i) => {
      const userAns = selectedAnswers[i];
      const isAttempted = userAns !== undefined && userAns !== null;
      const isCorrect = isAttempted && userAns === q.correct_answer;

      if (isAttempted) overallAttempted++;
      if (isCorrect) overallCorrect++;

      const secName = q.section || "General Intelligence";
      if (!sectionsData[secName]) {
        sectionsData[secName] = { correct: 0, attempted: 0, total: 0 };
      }
      sectionsData[secName].total++;
      if (isAttempted) sectionsData[secName].attempted++;
      if (isCorrect) sectionsData[secName].correct++;
    });

    const calculatedAccuracy = overallAttempted > 0 
      ? ((overallCorrect / overallAttempted) * 100).toFixed(1) 
      : "0.0";

    const durationMs = Date.now() - startTime;
    const totalSeconds = Math.floor(durationMs / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    const timeTakenStr = mins > 0 ? `${mins} min ${secs} sec` : `${secs} sec`;

    const quizId = `${category}_${fileName}`;
    
    try {
      const checkAttempted = await AsyncStorage.getItem(`attempted_${quizId}`);
      const reviewData = questions.map((q, i) => ({
        ...q,
        userAnswer: selectedAnswers[i] ?? null
      }));

      const existingHistory = await AsyncStorage.getItem('quiz_history');
      let history = [];
      if (existingHistory && existingHistory.trim()) {
        try {
          history = JSON.parse(existingHistory.replace(/^\uFEFF/, '').trim());
        } catch (e) {
          console.error("Error parsing quiz_history in handleFinish", e);
        }
      }

      // Find old entry to get the previous attempt count
      const oldEntry = history.find(h => h.quizId === quizId);
      const newAttemptCount = (oldEntry?.totalAttempts || 0) + 1;

      const attemptData = {
        id: Date.now().toString(),
        quizId,
        quizName: fileName,
        category,
        score: overallCorrect,
        total: questions.length,
        accuracy: calculatedAccuracy,
        sections: sectionsData,
        date: new Date().toISOString(),
        isFirstAttempt: !checkAttempted,
        attempted: overallAttempted,
        totalAttempts: newAttemptCount,
        isLive: isLive === 'true'
      };

      // Format for learn_progress (Status view)
      const learnProgressStr = await AsyncStorage.getItem('learn_progress');
      let learnProgress = {};
      if (learnProgressStr && learnProgressStr.trim()) {
        try {
          learnProgress = JSON.parse(learnProgressStr.replace(/^\uFEFF/, '').trim());
        } catch (e) {
          console.error("Error parsing learn_progress in handleFinish", e);
        }
      }

      const quizKey = isLive === 'true' ? `live_${quizId}` : `quiz_${quizId}`;
      learnProgress[quizKey] = {
        attempted: true,
        score: overallCorrect,
        total: questions.length,
        date: new Date().toISOString()
      };
      await AsyncStorage.setItem('learn_progress', JSON.stringify(learnProgress));

      // Filter out existing entry for this specific quiz to replace it
      history = history.filter(h => h.quizId !== quizId);

      await AsyncStorage.setItem('quiz_history', JSON.stringify([attemptData, ...history]));
      await AsyncStorage.setItem(`attempted_${quizId}`, 'true');

      // Save Score and Review Data
      const scoreKey = `score_${quizId}`;
      const reviewKey = `review_${quizId}`;
      const scoreData = {
        score: overallCorrect,
        total: questions.length,
        accuracy: calculatedAccuracy,
        date: new Date().toISOString()
      };

      await AsyncStorage.setItem(scoreKey, JSON.stringify(scoreData));

      // Handle Live Test History
      if (isLive === 'true') {
        const historyKey = 'live_quiz_history';
        const historyStr = await AsyncStorage.getItem(historyKey);
        const history = historyStr ? JSON.parse(historyStr) : {};

        // Find the absolute path for this quiz
        const liveRoot = getSafeRootDir().replace('ExamList/', 'LiveTest/');
        const fullPath = `${liveRoot}${category}/${fileName}`;

        history[fullPath] = {
          score: overallCorrect,
          total: questions.length,
          accuracy: calculatedAccuracy,
          date: new Date().toISOString()
        };

        await AsyncStorage.setItem(historyKey, JSON.stringify(history));
      }

      if (parseFloat(calculatedAccuracy) < 100) {
        await AsyncStorage.setItem(reviewKey, JSON.stringify(reviewData));
      } else {
        // If 100% accuracy, remove any existing review data
        await AsyncStorage.removeItem(reviewKey);
      }

      // 1. Update Analytics first (await these to ensure AsyncStorage is ready)
      if (isLive === 'true') {
        await updateLiveTestAnalytics(overallCorrect, calculatedAccuracy);
      } else {
        await updateSubjectiveAnalytics(quizId, overallCorrect, sectionsData, !checkAttempted);
      }

      // 2. Update Activity Time
      const activityMins = Math.floor((Date.now() - sessionStartTime) / 60000);
      if (activityMins > 0) {
          await updateActivityMinutes(activityMins);
      }

      // 3. Finally, trigger cloud sync to push both progress and analytics
      await syncAppStatus();
    } catch (e) {
      console.error("Error saving quiz results:", e);
    } finally {
      setIsSubmitting(false);
    }

    router.replace({
      pathname: "/quiz/result-summary",
      params: { 
        score: overallCorrect,
        total: questions.length, 
        attempted: overallAttempted,
        accuracy: calculatedAccuracy, 
        timeTaken: timeTakenStr,
        isLive: isLive || 'false',
        sections: JSON.stringify(sectionsData),
        review: JSON.stringify(questions.map((q, i) => ({
          ...q,
          userAnswer: selectedAnswers[i] ?? null
        })))
      }
    });
  };

  const handleEarlySubmit = () => {
    setExitModalVisible(true);
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4A90E2" />
      </View>
    );
  }

  const currentQ = questions[currentIndex];
  const optionLabels = ['A', 'B', 'C', 'D', 'E'];

  return (
    <View style={[styles.container, { paddingTop: 0 }]}>
      {/* Custom Header Replacement */}
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <View style={styles.topBarLeft}>
          <Text style={styles.sectionLabel} numberOfLines={1}>{currentQ?.section || "GENERAL KNOWLEDGE"}</Text>
          <Text style={styles.qIndicator}>QUESTION {currentIndex + 1} OF {questions.length}</Text>
        </View>

        <View style={styles.topBarRight}>
          <View style={styles.timerBadge}>
            <MaterialCommunityIcons name="clock-outline" size={16} color="#D63031" />
            <Text style={styles.timerText}>
              {mode === 'speed' ? `${perQuestionTimer}S` : `${Math.floor(timeLeft/60)}:${(timeLeft%60).toString().padStart(2, '0')}`}
            </Text>
          </View>
          <TouchableOpacity onPress={handleEarlySubmit} style={styles.endBtn}>
            <Text style={styles.endText}>END</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Exit Confirmation Modal */}
      <Modal visible={exitModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.exitModalContent}>
            <View style={styles.exitIconCircle}>
              <MaterialCommunityIcons name="pause-circle-outline" size={48} color="#FF7675" />
            </View>

            <Text style={styles.exitTitle}>END EXAM?</Text>
            <Text style={styles.exitDesc}>
              You are currently in the middle of a quiz. Would you like to end the exam now or continue answering?
            </Text>

            <View style={styles.exitActions}>
              <TouchableOpacity
                style={styles.continueBtn}
                onPress={() => setExitModalVisible(false)}
              >
                <Text style={styles.continueBtnText}>CONTINUE</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.endExamBtn}
                onPress={() => {
                  setExitModalVisible(false);
                  handleFinish();
                }}
              >
                <Text style={styles.endExamBtnText}>END EXAM</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ScrollView 
        ref={scrollRef}
        style={styles.content}
        contentContainerStyle={[
          styles.scrollInside, 
          { paddingBottom: insets.bottom + 120 }
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.questionCard}>
          <MathRenderer
            htmlContent={currentQ?.question_text}
            questionImage={currentQ?.question_image ? `${REMOTE_IMAGE_BASE}${currentQ.question_image}` : null}
            fontSize={18}
            isQuestion={true}
            githubToken={githubToken}
          />
        </View>

        <View style={styles.optionsWrapper}>
          {currentQ?.options?.map((option, index) => {
            const isSelected = selectedAnswers[currentIndex] === option;
            return (
              <TouchableOpacity
                key={index}
                activeOpacity={0.7}
                style={[
                  styles.optionCard,
                  isSelected && styles.optionSelected
                ]}
                onPress={() => setSelectedAnswers({...selectedAnswers, [currentIndex]: option})}
              >
                <View style={[
                  styles.optionBadge,
                  isSelected && styles.optionBadgeSelected
                ]}>
                  <Text style={[
                    styles.optionBadgeText,
                    isSelected && styles.optionBadgeTextSelected
                  ]}>{optionLabels[index]}</Text>
                </View>

                <View style={{ flex: 1 }}>
                  <MathRenderer
                    htmlContent={option}
                    fontSize={15}
                    isQuestion={false}
                  />
                </View>

                {isSelected && (
                  <MaterialCommunityIcons name="check-circle" size={24} color="#4A90E2" style={styles.checkIcon} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={[styles.bottomNav, { paddingBottom: insets.bottom + 20 }]}>
        {mode === 'practice' && (
          <TouchableOpacity 
            onPress={() => setCurrentIndex(currentIndex - 1)}
            disabled={currentIndex === 0}
            style={[styles.navButton, styles.prevButton, currentIndex === 0 && { opacity: 0 }]}
          >
            <MaterialCommunityIcons name="chevron-left" size={24} color="#2D3436" />
            <Text style={styles.prevBtnText}>PREV</Text>
          </TouchableOpacity>
        )}
        
        <TouchableOpacity 
          onPress={handleNext}
          disabled={isSubmitting}
          style={[
            styles.navButton,
            styles.nextButton,
            mode === 'speed' && { flex: 1 },
            isSubmitting && { opacity: 0.7 }
          ]}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <>
              <Text style={styles.nextBtnText}>
                {currentIndex === questions.length - 1 ? "FINISH EXAM" : "SAVE & NEXT"}
              </Text>
              <MaterialCommunityIcons name="chevron-right" size={24} color="#FFF" />
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '900', color: '#2D3436', letterSpacing: 1 },
  topBar: {
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#FFF',
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    zIndex: 10
  },
  topBarLeft: { flex: 1 },
  topBarRight: { flexDirection: 'row', alignItems: 'center' },
  sectionLabel: { fontSize: 10, fontWeight: '900', color: '#4A90E2', textTransform: 'uppercase', letterSpacing: 1 },
  qIndicator: { fontSize: 13, fontWeight: '900', color: '#2D3436', marginTop: 2, letterSpacing: 0.5 },
  endBtn: {
    backgroundColor: '#FFF5F5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#FF7675',
    marginLeft: 10
  },
  endText: { color: '#FF7675', fontSize: 11, fontWeight: '900' },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F2F6',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12
  },
  timerText: { marginLeft: 5, fontSize: 13, fontWeight: '900', color: '#2D3436' },
  content: { flex: 1 },
  scrollInside: { padding: 20 },
  questionCard: {
    backgroundColor: '#FFF',
    padding: 20,
    borderRadius: 35,
    marginBottom: 15,
    elevation: 6,
    shadowColor: '#A4B0BE',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    minHeight: 140,
    borderWidth: 1,
    borderColor: '#F1F2F6'
  },
  optionsWrapper: { gap: 8 },
  optionCard: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    padding: 12,
    borderRadius: 22,
    backgroundColor: '#FFF',
    borderWidth: 2,
    borderColor: '#F1F2F6',
    elevation: 1,
    shadowColor: '#A4B0BE',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 8
  },
  optionSelected: {
    borderColor: '#4A90E2',
    backgroundColor: '#F0F7FF',
    elevation: 3,
    shadowColor: '#4A90E2',
    shadowOpacity: 0.05,
    shadowRadius: 10
  },
  optionBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F2F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15
  },
  optionBadgeSelected: {
    backgroundColor: '#4A90E2'
  },
  optionBadgeText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#636E72'
  },
  optionBadgeTextSelected: {
    color: '#FFF'
  },
  checkIcon: {
    marginLeft: 10
  },
  bottomNav: { 
    position: 'absolute', 
    bottom: 0, 
    left: 0, 
    right: 0, 
    backgroundColor: '#FFF',
    borderTopLeftRadius: 35,
    borderTopRightRadius: 35,
    flexDirection: 'row',
    padding: 20,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    gap: 15
  },
  navButton: {
    height: 56,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20
  },
  prevButton: {
    flex: 0.4,
    backgroundColor: '#F1F2F6',
  },
  nextButton: {
    flex: 0.6,
    backgroundColor: '#2D3436',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 10
  },
  prevBtnText: { color: '#2D3436', fontWeight: '900', fontSize: 14, marginLeft: 5 },
  nextBtnText: { color: '#FFF', fontWeight: '900', fontSize: 14, marginRight: 5, letterSpacing: 1 },

  // Modal Styles (inherited but keeping for consistency)
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(45, 52, 54, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30
  },
  exitModalContent: {
    backgroundColor: '#FFF',
    width: '100%',
    borderRadius: 35,
    padding: 30,
    alignItems: 'center',
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20
  },
  exitIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFF5F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20
  },
  exitTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#2D3436',
    marginBottom: 10,
    letterSpacing: 1
  },
  exitDesc: {
    fontSize: 14,
    color: '#636E72',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 25,
    fontWeight: '500'
  },
  exitActions: {
    width: '100%',
    gap: 12
  },
  continueBtn: {
    backgroundColor: '#4CAF50',
    width: '100%',
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8
  },
  continueBtnText: {
    color: '#FFF',
    fontWeight: '900',
    fontSize: 14,
    letterSpacing: 1
  },
  endExamBtn: {
    backgroundColor: '#FFF',
    width: '100%',
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FF7675'
  },
  endExamBtnText: {
    color: '#FF7675',
    fontWeight: '900',
    fontSize: 14,
    letterSpacing: 1
  }
});
