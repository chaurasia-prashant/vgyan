import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert, Modal, FlatList
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { readAsStringAsync } from 'expo-file-system/legacy';
import { getSafeRootDir } from '../../utils/fileManager';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MathRenderer from '../../components/MathRenderer';
import { syncAppStatus, GITHUB_USERNAME, REPO_NAME } from '../../utils/syncService';

const REMOTE_IMAGE_BASE = `https://api.github.com/repos/${GITHUB_USERNAME}/${REPO_NAME}/contents/exercise_files/`;

export default function ExerciseScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { category, fileName } = useLocalSearchParams();

  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedOption, setSelectedOption] = useState(null);
  const [showSolution, setShowSolution] = useState(false);
  const [isJumpModalVisible, setIsJumpModalVisible] = useState(false);
  const [githubToken, setGithubToken] = useState(null);

  const scrollRef = useRef(null);

  useEffect(() => {
    const fetchToken = async () => {
      const token = await AsyncStorage.getItem('github_token');
      setGithubToken(token);
    };
    fetchToken();
    loadData();
  }, []);

  const loadData = async () => {
    const root = getSafeRootDir();
    // Correct Path: sibling to ExamList
    const learnRoot = root.replace('ExamList/', 'Learn/');
    const fileKey = `${category}_${fileName}`;

    try {
      const filePath = `${learnRoot}${category}/${fileName}`;

      const content = await readAsStringAsync(filePath);
      if (!content || !content.trim()) {
        throw new Error("Empty content in exercise file.");
      }
      const data = JSON.parse(content.replace(/^\uFEFF/, '').trim());
      const qArray = data.questions || (Array.isArray(data) ? data : []);

      if (qArray.length === 0) {
        throw new Error("No questions found in file.");
      }

      setQuestions(qArray);

      const progressStr = await AsyncStorage.getItem('learn_progress');
      if (progressStr && progressStr.trim()) {
        const progress = JSON.parse(progressStr.replace(/^\uFEFF/, '').trim());
        if (progress[fileKey]) {
          setCurrentIndex(progress[fileKey].index || 0);
        }
      }
    } catch (e) {
      Alert.alert("Error", "Could not load exercise. Please check if the file exists.");
      router.back();
    } finally {
      setIsLoading(false);
    }
  };

  const saveProgress = async (index) => {
    try {
      const fileKey = `${category}_${fileName}`;
      const progressStr = await AsyncStorage.getItem('learn_progress');
      let progress = {};
      if (progressStr && progressStr.trim()) {
        try {
          progress = JSON.parse(progressStr.replace(/^\uFEFF/, '').trim());
        } catch (e) {
          console.error("Error parsing progress in saveProgress", e);
        }
      }

      const isCompleted = index === questions.length - 1;
      progress[fileKey] = {
        index,
        completed: progress[fileKey]?.completed || isCompleted
      };

      await AsyncStorage.setItem('learn_progress', JSON.stringify(progress));
      // Trigger cloud sync
      syncAppStatus();
    } catch (e) { }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      setSelectedOption(null);
      setShowSolution(false);
      saveProgress(nextIdx);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    } else {
      router.back();
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      const prevIdx = currentIndex - 1;
      setCurrentIndex(prevIdx);
      setSelectedOption(null);
      setShowSolution(false);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
  };

  const handleJump = (index) => {
    setCurrentIndex(index);
    setSelectedOption(null);
    setShowSolution(false);
    setIsJumpModalVisible(false);
    saveProgress(index);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  if (isLoading) return <View style={styles.center}><ActivityIndicator size="large" color="#4A90E2" /></View>;

  const currentQ = questions[currentIndex];
  const hasOptions = currentQ?.options && Array.isArray(currentQ.options) && currentQ.options.length > 0;

  const formatMathContent = (text) => {
    if (!text) return "";
    return text.replace(/\\n/g, '<br/>').replace(/\n/g, '<br/>');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.endBtn}>
          <MaterialCommunityIcons name="close" size={20} color="#FF5252" />
          <Text style={styles.endText}>END</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setIsJumpModalVisible(true)} style={styles.jumpBtn}>
          <Text style={styles.qIndicator}>QUESTION {currentIndex + 1}/{questions.length}</Text>
          <MaterialCommunityIcons name="view-grid-outline" size={18} color="#4A90E2" style={{marginLeft: 8}} />
        </TouchableOpacity>

        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.contentPadding, { paddingBottom: insets.bottom + 120 }]}
      >
        <View style={styles.card}>
          <View style={styles.questionBadge}>
            <Text style={styles.badgeText}>EXERCISE QUESTION</Text>
          </View>
          <MathRenderer
            htmlContent={formatMathContent(currentQ?.question_text)}
            questionImage={currentQ?.question_image ? `${REMOTE_IMAGE_BASE}${currentQ.question_image}` : null}
            fontSize={18}
            isQuestion={true}
            githubToken={githubToken}
          />
        </View>

        {hasOptions && (
          <View style={styles.optionsWrapper}>
            {currentQ.options.map((option, idx) => {
              const isSelected = selectedOption === option;
              const isCorrect = option === currentQ.correct_answer;

              return (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.optionCard,
                    isSelected && (isCorrect ? styles.optionCorrect : styles.optionWrong)
                  ]}
                  onPress={() => setSelectedOption(option)}
                  disabled={selectedOption !== null}
                >
                  <View style={[styles.optionIndex, isSelected && { backgroundColor: isCorrect ? '#2ECC71' : '#FF5252' }]}>
                    <Text style={[styles.optionIndexText, isSelected && { color: '#FFF' }]}>
                      {String.fromCharCode(65 + idx)}
                    </Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <MathRenderer
                      htmlContent={formatMathContent(option)}
                      fontSize={15}
                      isQuestion={false}
                      githubToken={githubToken}
                    />
                  </View>
                  {isSelected && (
                    <MaterialCommunityIcons
                      name={isCorrect ? "check-circle" : "close-circle"}
                      size={24}
                      color={isCorrect ? "#2ECC71" : "#FF5252"}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <TouchableOpacity
          style={[styles.solBtn, showSolution && styles.solBtnActive]}
          onPress={() => setShowSolution(!showSolution)}
        >
          <MaterialCommunityIcons name="lightbulb-on-outline" size={20} color={showSolution ? "#FFF" : "#2D3436"} />
          <Text style={[styles.solBtnText, showSolution && { color: '#FFF' }]}>
            {showSolution ? "HIDE SOLUTION" : "VIEW SOLUTION"}
          </Text>
        </TouchableOpacity>

        {showSolution && (
          <View style={styles.solutionCard}>
            <View style={styles.solHeaderRow}>
              <View style={styles.solIndicator} />
              <Text style={styles.solutionHeader}>EXPLANATION</Text>
            </View>
            <MathRenderer
              htmlContent={formatMathContent(currentQ?.solution) || "No detailed explanation provided."}
              fontSize={15}
              isQuestion={false}
              githubToken={githubToken}
            />
          </View>
        )}
      </ScrollView>

      <View style={[styles.bottomNav, { paddingBottom: insets.bottom + 20 }]}>
        <TouchableOpacity
          onPress={handlePrevious}
          disabled={currentIndex === 0}
          style={[styles.navBtn, styles.prevBtn, currentIndex === 0 && { opacity: 0.3 }]}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color="#2D3436" />
        </TouchableOpacity>

        <TouchableOpacity onPress={handleNext} style={[styles.navBtn, styles.nextBtn]}>
          <Text style={styles.nextText}>
            {currentIndex === questions.length - 1 ? "FINISH" : "NEXT QUESTION"}
          </Text>
          <MaterialCommunityIcons name="arrow-right" size={24} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* Grid Jump Modal */}
      <Modal visible={isJumpModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Jump to Question</Text>
              <TouchableOpacity onPress={() => setIsJumpModalVisible(false)}>
                <MaterialCommunityIcons name="close" size={24} color="#2D3436" />
              </TouchableOpacity>
            </View>

            <FlatList
              data={questions}
              numColumns={5}
              keyExtractor={(_, i) => i.toString()}
              contentContainerStyle={{ paddingBottom: 20 }}
              renderItem={({ index }) => (
                <TouchableOpacity
                  style={[
                    styles.gridItem,
                    currentIndex === index && styles.gridItemActive
                  ]}
                  onPress={() => handleJump(index)}
                >
                  <Text style={[
                    styles.gridText,
                    currentIndex === index && styles.gridTextActive
                  ]}>{index + 1}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0'
  },
  endBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#FFF5F5',
    gap: 4
  },
  endText: { color: '#FF5252', fontWeight: '900', fontSize: 12, letterSpacing: 1 },
  jumpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F7FF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20
  },
  qIndicator: { fontSize: 13, fontWeight: '900', color: '#4A90E2', letterSpacing: 0.5 },
  contentPadding: { padding: 20 },
  card: {
    backgroundColor: '#FFF',
    padding: 25,
    borderRadius: 35,
    marginBottom: 20,
    elevation: 6,
    shadowColor: '#A4B0BE',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    borderWidth: 1,
    borderColor: '#F1F2F6'
  },
  questionBadge: {
    backgroundColor: '#F1F2F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginBottom: 15
  },
  badgeText: { fontSize: 10, fontWeight: '900', color: '#A4B0BE', letterSpacing: 1 },
  optionsWrapper: { gap: 15, marginBottom: 25 },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    borderRadius: 22,
    backgroundColor: '#FFF',
    elevation: 4,
    shadowColor: '#A4B0BE',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: '#F1F2F6'
  },
  optionIndex: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: '#F1F2F6', justifyContent: 'center', alignItems: 'center'
  },
  optionIndexText: { fontSize: 14, fontWeight: '900', color: '#2D3436' },
  optionCorrect: { backgroundColor: '#E8F5E9', elevation: 0, borderWidth: 1, borderColor: '#2ECC71' },
  optionWrong: { backgroundColor: '#FFEBEE', elevation: 0, borderWidth: 1, borderColor: '#FF5252' },
  solBtn: {
    flexDirection: 'row',
    gap: 10,
    padding: 18,
    borderRadius: 22,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 25,
    borderWidth: 2,
    borderColor: '#F1F2F6'
  },
  solBtnActive: { backgroundColor: '#2D3436', borderColor: '#2D3436' },
  solBtnText: { color: '#2D3436', fontWeight: '900', fontSize: 14, letterSpacing: 1 },
  solutionCard: {
    padding: 25,
    backgroundColor: '#FFF',
    borderRadius: 35,
    marginBottom: 30,
    borderLeftWidth: 5,
    borderLeftColor: '#2D3436',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.05
  },
  solHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15, gap: 10 },
  solIndicator: { width: 12, height: 12, borderRadius: 4, backgroundColor: '#2D3436' },
  solutionHeader: { fontWeight: '900', fontSize: 12, color: '#2D3436', letterSpacing: 1.5 },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    backgroundColor: '#FFF',
    paddingHorizontal: 20,
    paddingTop: 15,
    flexDirection: 'row',
    borderTopLeftRadius: 35,
    borderTopRightRadius: 35,
    elevation: 20,
    shadowColor: '#000',
    shadowOpacity: 0.1
  },
  navBtn: { height: 60, borderRadius: 20, justifyContent: 'center', alignItems: 'center', flexDirection: 'row' },
  prevBtn: { flex: 0.25, backgroundColor: '#F1F2F6', marginRight: 15 },
  nextBtn: { flex: 0.75, backgroundColor: '#4A90E2', gap: 10 },
  nextText: { color: '#FFF', fontWeight: '900', fontSize: 16, letterSpacing: 1 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 40, borderTopRightRadius: 40, height: '75%', padding: 30 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 },
  modalTitle: { fontSize: 22, fontWeight: '900', color: '#1A1A1A', letterSpacing: 1 },
  gridItem: { width: '17%', aspectRatio: 1, margin: '1.5%', borderRadius: 15, backgroundColor: '#F1F2F6', justifyContent: 'center', alignItems: 'center' },
  gridItemActive: { backgroundColor: '#4A90E2' },
  gridText: { fontSize: 15, fontWeight: '900', color: '#2D3436' },
  gridTextActive: { color: '#FFF' }
});
