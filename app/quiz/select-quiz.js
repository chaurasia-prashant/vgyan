import React, { useState, useCallback, useRef } from 'react';
import { 
  View, Text, TouchableOpacity, StyleSheet, FlatList, 
  ActivityIndicator, Modal, Alert
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { readDirectoryAsync, readAsStringAsync, getInfoAsync } from 'expo-file-system/legacy';
import { getSafeRootDir, sanitizeName } from '../../utils/fileManager';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncAppStatus } from '../../utils/syncService';

export default function SelectQuiz() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { category } = useLocalSearchParams();
  
  const [activeTab, setActiveTab] = useState('open');
  const [allQuizzes, setAllQuizzes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [attemptedList, setAttemptedList] = useState({});
  const [quizScores, setQuizScores] = useState({});
  const [hasReview, setHasReview] = useState({});
  const [modalVisible, setModalVisible] = useState(false);
  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [quizToReset, setQuizToReset] = useState(null);
  const [selectedQuiz, setSelectedQuiz] = useState(null);
  const [selectedMode, setSelectedMode] = useState('practice');
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [customTime, setCustomTime] = useState(60);
  const [quizDetails, setQuizDetails] = useState({});
  const trackWidth = useRef(0);

  const maxTime = Math.ceil((totalQuestions + 25) / 5) * 5;
  const minTime = 1;

  useFocusEffect(
    useCallback(() => {
      loadFiles();
    }, [category])
  );


const loadFiles = async () => {
  const root = getSafeRootDir();
  try {
    setIsLoading(true);
    const cleanCat = sanitizeName(category);
    const targetPath = `${root}${cleanCat}/`;
    
    const info = await getInfoAsync(targetPath);
    if (info.exists) {
      const files = await readDirectoryAsync(targetPath);
      const jsonFiles = files.filter(f => f.toLowerCase().endsWith('.json') && !f.startsWith('.'));
      setAllQuizzes(jsonFiles);

      let status = {};
      let details = {};
      let scores = {};
      let reviews = {};

      const learnProgressStr = await AsyncStorage.getItem('learn_progress');
      let learnProgress = {};
      if (learnProgressStr && learnProgressStr.trim()) {
        try {
          learnProgress = JSON.parse(learnProgressStr.replace(/^\uFEFF/, '').trim());
        } catch (e) {
          console.error("Error parsing learn_progress in loadFiles", e);
        }
      }

      // Loop through each file to get attempted status AND question count
      for (let quiz of jsonFiles) {
        const quizId = `${category}_${quiz}`;
        const quizKey = `quiz_${quizId}`;
        const cloudProgress = learnProgress[quizKey];

        // Check Attempted Status
        const val = await AsyncStorage.getItem(`attempted_${quizId}`);
        if (val || cloudProgress?.attempted) {
          status[quiz] = true;
          if (cloudProgress?.attempted && !val) {
             await AsyncStorage.setItem(`attempted_${quizId}`, 'true');
          }
        }

        // Check Score
        const scoreVal = await AsyncStorage.getItem(`score_${quizId}`);
        if (scoreVal && scoreVal.trim()) {
          try {
            scores[quiz] = JSON.parse(scoreVal.replace(/^\uFEFF/, '').trim());
          } catch (e) {
            console.error("Error parsing scoreVal", e);
          }
        } else if (cloudProgress) {
          const cloudScore = {
            score: cloudProgress.score,
            total: cloudProgress.total,
            date: cloudProgress.date,
            accuracy: ((cloudProgress.score / cloudProgress.total) * 100).toFixed(1)
          };
          scores[quiz] = cloudScore;
          await AsyncStorage.setItem(`score_${quizId}`, JSON.stringify(cloudScore));
        }

        // Check Review
        const reviewVal = await AsyncStorage.getItem(`review_${quizId}`);
        if (reviewVal) reviews[quiz] = true;

        // Get Question Count
        try {
          const content = await readAsStringAsync(`${targetPath}${quiz}`);
          if (content && content.trim()) {
            const data = JSON.parse(content.replace(/^\uFEFF/, '').trim());
            const qCount = data.questions ? data.questions.length : (Array.isArray(data) ? data.length : 0);
            details[quiz] = qCount;
          } else {
            details[quiz] = 0;
          }
        } catch (e) {
          details[quiz] = 0; // Fallback if file is corrupted
        }
      }
      
      setAttemptedList(status);
      setQuizDetails(details);
      setQuizScores(scores);
      setHasReview(reviews);
    }
  } catch (e) { 
    Alert.alert("Load Error", "Could not access the quiz folder.");
  } finally { 
    setIsLoading(false); 
  }
};

  const handleReset = (fileName) => {
    setQuizToReset(fileName);
    setResetModalVisible(true);
  };

  const performReset = async () => {
    if (!quizToReset) return;
    const quizId = `${category}_${quizToReset}`;
    const quizKey = `quiz_${quizId}`;
    try {
      // 1. Remove specific keys from local storage
      await AsyncStorage.removeItem(`attempted_${quizId}`);
      await AsyncStorage.removeItem(`score_${quizId}`);
      await AsyncStorage.removeItem(`review_${quizId}`);

      // 2. Remove from global history
      const historyData = await AsyncStorage.getItem('quiz_history');
      if (historyData && historyData.trim()) {
        try {
          const history = JSON.parse(historyData.replace(/^\uFEFF/, '').trim());
          const updatedHistory = history.filter(item => item.quizId !== quizId);
          await AsyncStorage.setItem('quiz_history', JSON.stringify(updatedHistory));
        } catch (e) {
          console.error("Error parsing quiz_history in performReset", e);
        }
      }

      // 3. Remove from cloud sync progress (learn_progress)
      const learnProgressStr = await AsyncStorage.getItem('learn_progress');
      if (learnProgressStr) {
        try {
          let learnProgress = JSON.parse(learnProgressStr.replace(/^\uFEFF/, '').trim());
          if (learnProgress[quizKey]) {
            delete learnProgress[quizKey];
            await AsyncStorage.setItem('learn_progress', JSON.stringify(learnProgress));
            // Trigger a cloud sync to reflect the reset on GitHub
            syncAppStatus(true);
          }
        } catch (e) {
          console.error("Error updating learn_progress in performReset", e);
        }
      }

      // 4. UI Cleanup
      setResetModalVisible(false);
      setQuizToReset(null);

      // Force immediate UI update
      setAttemptedList(prev => {
        const next = { ...prev };
        delete next[quizToReset];
        return next;
      });
      setQuizScores(prev => {
        const next = { ...prev };
        delete next[quizToReset];
        return next;
      });
      setHasReview(prev => {
        const next = { ...prev };
        delete next[quizToReset];
        return next;
      });

      // Reload files to be sure
      loadFiles();

      Alert.alert("Success", "Quiz progress has been reset.");
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Could not reset quiz data.");
    }
  };

  const openModeSelection = async (fileName) => {
    const root = getSafeRootDir();
    const cleanCat = sanitizeName(category);
    const filePath = `${root}${cleanCat}/${fileName}`;

    try {
      const fileInfo = await getInfoAsync(filePath);
      if (!fileInfo.exists) {
        Alert.alert("Error", "File not found on storage.");
        return;
      }

      const content = await readAsStringAsync(filePath);
      if (!content || !content.trim()) {
        Alert.alert("Error", "Quiz file is empty.");
        return;
      }
      const data = JSON.parse(content.replace(/^\uFEFF/, '').trim());
      
      // Support both { questions: [] } and straight [ ] formats
      const qArray = data.questions || (Array.isArray(data) ? data : []);
      
      if (qArray.length === 0) {
        Alert.alert("Empty Quiz", "This file contains no questions.");
        return;
      }

      setTotalQuestions(qArray.length);
      // Default time: number of questions
      setCustomTime(qArray.length);
      setSelectedQuiz(fileName);
      setModalVisible(true); // Now the modal opens
    } catch (e) { 
      Alert.alert("Parse Error", "The JSON format is invalid. Ensure it follows the required structure.");
    }
  };

  const renderQuizItem = ({ item }) => {
    const scoreInfo = quizScores[item];
    const scorePercentage = scoreInfo ? (parseFloat(scoreInfo.score) / parseFloat(scoreInfo.total)) * 100 : 0;
    const isCompleted = scorePercentage >= 100;
    const quizId = `${category}_${item}`;
    const attempted = attemptedList[item];

    const getTheme = () => {
      if (!attempted) return { main: '#4A90E2', bg: '#F1F2F6', icon: 'file-document-outline' };
      if (isCompleted) return { main: '#4A90E2', bg: '#E8F2FF', icon: 'trophy' };
      if (scorePercentage >= 80) return { main: '#55C595', bg: '#E8F5E9', icon: 'check-circle' };
      if (scorePercentage >= 50) return { main: '#1976D2', bg: '#E3F2FD', icon: 'clock-check' };
      return { main: '#D63031', bg: '#FFF5F5', icon: 'alert-circle' };
    };

    const theme = getTheme();

    return (
      <View style={styles.card}>
        {/* Top Section: Full Width Quiz Title */}
        <View style={styles.titleRow}>
          <MaterialCommunityIcons 
            name={theme.icon}
            size={22}
            color={theme.main}
            style={{ marginRight: 10 }}
          />
          <Text style={styles.cardText} numberOfLines={2}>
            {item.replace('.json', '').replace(/_/g, ' ').toUpperCase()}
          </Text>
          {isCompleted && (
            <TouchableOpacity
              onPress={() => handleReset(item)}
              style={styles.resetBtn}
            >
              <MaterialCommunityIcons name="refresh" size={20} color="#D63031" />
            </TouchableOpacity>
          )}
        </View>

        {/* Bottom Section: Details and Action Button */}
        <View style={styles.actionRow}>
          <View style={styles.metaInfo}>
            <View style={styles.qCountBadge}>
              <MaterialCommunityIcons name="format-list-numbered" size={14} color="#A4B0BE" />
              <Text style={styles.questionCount}>
                {quizDetails[item] || 0} QUESTIONS
              </Text>
            </View>

            {attempted && (
              <View style={[styles.statusBadge, { backgroundColor: theme.bg }]}>
                <Text style={[styles.completedTag, { color: theme.main }]}>
                  {isCompleted ? "COMPLETED" : `SCORE: ${scoreInfo?.score}/${scoreInfo?.total}`}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.buttonGroup}>
            {hasReview[item] && (
              <TouchableOpacity
                style={[styles.reviewSmallBtn, { backgroundColor: theme.bg, borderColor: theme.main + '30' }]}
                onPress={async () => {
                  const reviewData = await AsyncStorage.getItem(`review_${quizId}`);
                  if (reviewData) {
                    router.push({
                      pathname: "/quiz/review-screen",
                      params: { review: reviewData }
                    });
                  }
                }}
              >
                <MaterialCommunityIcons name="book-search" size={20} color={theme.main} />
              </TouchableOpacity>
            )}

            {isCompleted ? (
              <TouchableOpacity
                style={[styles.startBtn, { backgroundColor: theme.main }]}
                onPress={async () => {
                  const root = getSafeRootDir();
                  const cleanCat = sanitizeName(category);
                  const content = await readAsStringAsync(`${root}${cleanCat}/${item}`);
                  router.push({
                    pathname: "/quiz/revise-screen",
                    params: { quizData: content }
                  });
                }}
              >
                <Text style={styles.btnText}>REVISE</Text>
                <MaterialCommunityIcons name="book-open-variant" size={18} color="#FFF" style={{ marginLeft: 5 }} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.startBtn, attempted && { backgroundColor: theme.main }]}
                onPress={() => openModeSelection(item)}
              >
                <Text style={styles.btnText}>
                  {attempted ? "RE-ATTEMPT" : "START QUIZ"}
                </Text>
                {!attempted && (
                  <MaterialCommunityIcons
                    name="play"
                    size={18}
                    color="#FFF"
                    style={{ marginLeft: 5 }}
                  />
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerSection}>
        <Text style={styles.header}>{category.replace(/_/g, ' ').toUpperCase()}</Text>

        <View style={styles.tabBar}>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'open' && styles.activeTab]} 
            onPress={() => setActiveTab('open')}
          >
            <Text style={[styles.tabText, activeTab === 'open' && styles.activeTabText]}>
              Open ({allQuizzes.filter(q => {
                const s = quizScores[q];
                const pct = s ? (parseFloat(s.score) / parseFloat(s.total)) * 100 : 0;
                return pct < 100;
              }).length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'completed' && styles.activeTab]}
            onPress={() => setActiveTab('completed')}
          >
            <Text style={[styles.tabText, activeTab === 'completed' && styles.activeTabText]}>
              Completed ({allQuizzes.filter(q => {
                const s = quizScores[q];
                const pct = s ? (parseFloat(s.score) / parseFloat(s.total)) * 100 : 0;
                return pct >= 100;
              }).length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      
      {isLoading ? (
        <ActivityIndicator size="large" color="#4CAF50" style={{marginTop: 50}} />
      ) : (
        <FlatList
          data={activeTab === 'open'
            ? allQuizzes.filter(q => {
                const s = quizScores[q];
                const pct = s ? (parseFloat(s.score) / parseFloat(s.total)) * 100 : 0;
                return pct < 100;
              })
            : allQuizzes.filter(q => {
                const s = quizScores[q];
                const pct = s ? (parseFloat(s.score) / parseFloat(s.total)) * 100 : 0;
                return pct >= 100;
              })}
          keyExtractor={(item) => item}
          renderItem={renderQuizItem}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 ,paddingHorizontal: 20}]}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <MaterialCommunityIcons name="folder-open" size={60} color="#E0E0E0" />
              <Text style={styles.emptyText}>No quizzes found in this category.</Text>
            </View>
          }
        />
      )}

      {/* Mode Selection Modal */}
       <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
              <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Exam Setup</Text>
                    <View style={styles.modalBadge}>
                      <MaterialCommunityIcons name="layers-outline" size={14} color="#4CAF50" />
                      <Text style={styles.modalSub}>{totalQuestions} QUESTIONS</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.modeOption}
                    onPress={() => {
                      setModalVisible(false);
                      router.push({ pathname: "/quiz/quiz-screen", params: { category, fileName: selectedQuiz, mode: 'speed' } });
                    }}
                  >
                    <View style={[styles.modeIcon, { backgroundColor: '#FFF4E5' }]}>
                      <MaterialCommunityIcons name="lightning-bolt" size={28} color="#FF9800" />
                    </View>
                    <View style={styles.modeText}>
                      <Text style={styles.modeName}>Speed Mode</Text>
                      <Text style={styles.modeDesc}>1 minute per question. Quick thinking!</Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.modeOption}
                    onPress={() => {
                      setModalVisible(false);
                      router.push({ pathname: "/quiz/quiz-screen", params: { category, fileName: selectedQuiz, mode: 'practice', timeLimit: customTime } });
                    }}
                  >
                    <View style={[styles.modeIcon, { backgroundColor: '#E3F2FD' }]}>
                      <MaterialCommunityIcons name="school" size={28} color="#2196F3" />
                    </View>
                    <View style={styles.modeText}>
                      <Text style={styles.modeName}>Practice Mode</Text>
                      <Text style={styles.modeDesc}>Flexible duration. {Math.max(1, Math.floor(totalQuestions * 0.8))}m recommended.</Text>
                    </View>
                  </TouchableOpacity>

                  <View style={styles.timeSetting}>
                     <View style={styles.timeHeader}>
                       <Text style={styles.timeLabel}>Practice Duration:</Text>
                       <View style={styles.timeDisplay}>
                         <Text style={styles.timeValueText}>{customTime}</Text>
                         <Text style={styles.minsLabel}>MINS</Text>
                       </View>
                     </View>

                     <View style={styles.sliderContainer}>
                       <View
                         style={styles.sliderTrack}
                         onLayout={(e) => { trackWidth.current = e.nativeEvent.layout.width }}
                         onStartShouldSetResponder={() => true}
                         onMoveShouldSetResponder={() => true}
                         onResponderGrant={(e) => {
                           if (trackWidth.current === 0) return;
                           const x = e.nativeEvent.locationX;
                           const percent = Math.min(Math.max(x / trackWidth.current, 0), 1);
                           const rawVal = percent * (maxTime - minTime) + minTime;
                           const steppedVal = Math.round(rawVal);
                           setCustomTime(Math.max(minTime, Math.min(maxTime, steppedVal)));
                         }}
                         onResponderMove={(e) => {
                           if (trackWidth.current === 0) return;
                           const x = e.nativeEvent.locationX;
                           const percent = Math.min(Math.max(x / trackWidth.current, 0), 1);
                           const rawVal = percent * (maxTime - minTime) + minTime;
                           const steppedVal = Math.round(rawVal);
                           setCustomTime(Math.max(minTime, Math.min(maxTime, steppedVal)));
                         }}
                       >
                         <View
                           pointerEvents="none"
                           style={[styles.sliderFill, { width: `${((customTime - minTime) / (maxTime - minTime)) * 100}%` }]}
                         />
                         <View
                           pointerEvents="none"
                           style={[styles.sliderThumb, { left: `${((customTime - minTime) / (maxTime - minTime)) * 100}%` }]}
                         />
                       </View>
                       <View style={styles.sliderLabels}>
                         <Text style={styles.limitText}>{minTime}m</Text>
                         <Text style={styles.limitText}>{maxTime}m</Text>
                       </View>
                     </View>
                  </View>

                  <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                    <Text style={styles.closeText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>

      {/* Reset Confirmation Modal */}
      <Modal visible={resetModalVisible} transparent animationType="fade" onRequestClose={() => setResetModalVisible(false)}>
        <View style={styles.resetOverlay}>
          <View style={styles.resetContent}>
            <View style={styles.resetIconBg}>
              <MaterialCommunityIcons name="refresh" size={40} color="#FF7675" />
            </View>
            <Text style={styles.resetTitle}>Reset Progress?</Text>
            <Text style={styles.resetDesc}>
              This will permanently delete your scores and reviews for this quiz.
            </Text>

            <View style={styles.resetActions}>
              <TouchableOpacity
                style={styles.cancelResetBtn}
                onPress={() => setResetModalVisible(false)}
              >
                <Text style={styles.cancelResetText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.confirmResetBtn}
                onPress={performReset}
              >
                <Text style={styles.confirmResetText}>Reset</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  headerSection: {
    backgroundColor: '#FFF',
    paddingHorizontal: 20,
    paddingTop: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    alignItems: 'center'
  },
  header: {
    fontSize: 20,
    fontWeight: '900',
    color: '#2D3436',
    marginBottom: 15,
    letterSpacing: 1,
    textAlign: 'center'
  },
  tabBar: { flexDirection: 'row', backgroundColor: '#F1F2F6', borderRadius: 12, padding: 4, marginBottom: 15 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  activeTab: { backgroundColor: '#FFF', elevation: 2 },
  tabText: { fontSize: 14, fontWeight: '600', color: '#95A5A6' },
  activeTabText: { color: '#2D3436' },
  listContent: { padding: 20 },
  card: { 
    backgroundColor: '#FFF', 
    padding: 20,
    borderRadius: 24,
    marginBottom: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: '#F1F2F6'
  },
  titleRow: { 
    flexDirection: 'row', 
    alignItems: 'center',
    marginBottom: 15,
  },
  cardText: { 
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: '#2D3436',
    letterSpacing: 0.3,
    marginRight: 10
  },
  resetBtn: {
    padding: 5,
    borderRadius: 8,
    backgroundColor: '#FFF5F5'
  },
  actionRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    borderTopWidth: 1,
    borderTopColor: '#F1F2F6',
    paddingTop: 15,
  },
  metaInfo: {
    flex: 1,
    marginRight: 10,
    justifyContent: 'center'
  },
  qCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6
  },
  questionCount: {
    fontSize: 11,
    color: '#A4B0BE',
    fontWeight: '800',
    marginLeft: 5,
    letterSpacing: 0.5
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start'
  },
  completedTag: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5
  },
  buttonGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  reviewSmallBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#F0F7FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D0E4FF'
  },
  startBtn: { 
    backgroundColor: '#2ECC71',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 110,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4
  },
  reAttemptBtn: { 
    backgroundColor: '#4A90E2',
    shadowColor: '#4A90E2',
  },
  btnText: { 
    color: '#FFF', 
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.3
  },
  emptyBox: { alignItems: 'center', marginTop: 80 },
  emptyText: { color: '#B2BEC3', marginTop: 10, fontSize: 15 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 30 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: '#2D3436' },
  modalBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5E9', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, gap: 4 },
  modalSub: { color: '#4CAF50', fontWeight: '900', fontSize: 11 },
  modeOption: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', padding: 18, borderRadius: 20, marginBottom: 15, borderWidth: 1, borderColor: '#F0F0F0' },
    modeIcon: { width: 50, height: 50, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
    modeText: { marginLeft: 15, flex: 1 },
    modeName: { fontWeight: '800', fontSize: 18, color: '#2D3436' },
    modeDesc: { fontSize: 13, color: '#95A5A6', marginTop: 2 },
    timeSetting: { marginTop: 20, marginBottom: 10 },
    timeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
    timeLabel: { fontSize: 13, fontWeight: '900', color: '#7F8C8D', letterSpacing: 0.5 },
    timeDisplay: { flexDirection: 'row', alignItems: 'baseline', gap: 4, backgroundColor: '#F1F2F6', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
    timeValueText: { fontSize: 18, fontWeight: '900', color: '#2196F3' },
    minsLabel: { fontSize: 9, fontWeight: '900', color: '#A4B0BE' },
    sliderContainer: { paddingHorizontal: 5 },
    sliderTrack: { height: 8, backgroundColor: '#F1F2F6', borderRadius: 4, position: 'relative', justifyContent: 'center' },
    sliderFill: { height: '100%', backgroundColor: '#2196F3', borderRadius: 4 },
    sliderThumb: {
      width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFF',
      position: 'absolute', elevation: 4, shadowColor: '#000', shadowOpacity: 0.2,
      shadowRadius: 4, borderWidth: 3, borderColor: '#2196F3', marginLeft: -12
    },
    sliderLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
    limitText: { fontSize: 10, fontWeight: '800', color: '#A4B0BE' },
    closeBtn: { marginTop: 10, paddingVertical: 15, alignItems: 'center' },
    closeText: { color: '#95A5A6', fontWeight: 'bold', fontSize: 16 },

    // Reset Modal Styles
    resetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    resetContent: { backgroundColor: '#FFF', borderRadius: 32, padding: 30, alignItems: 'center', width: '100%', maxWidth: 340, elevation: 20, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10 },
    resetIconBg: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#FFF5F5', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    resetTitle: { fontSize: 22, fontWeight: '900', color: '#2D3436', marginBottom: 10 },
    resetDesc: { fontSize: 14, color: '#95A5A6', textAlign: 'center', lineHeight: 20, marginBottom: 25 },
    resetActions: { flexDirection: 'row', gap: 12, width: '100%' },
    cancelResetBtn: { flex: 1, paddingVertical: 15, borderRadius: 16, backgroundColor: '#F1F2F6', alignItems: 'center' },
    cancelResetText: { color: '#95A5A6', fontWeight: '800', fontSize: 15 },
    confirmResetBtn: { flex: 1, paddingVertical: 15, borderRadius: 16, backgroundColor: '#D63031', alignItems: 'center' },
    confirmResetText: { color: '#FFF', fontWeight: '800', fontSize: 15 },
  });