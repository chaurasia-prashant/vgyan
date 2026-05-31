import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Modal, SafeAreaView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useFocusEffect } from 'expo-router';
import { getSafeRootDir } from '../../utils/fileManager';

export default function LiveTestSeries() {
  const [activeTab, setActiveTab] = useState('Open');
  const [openQuizzes, setOpenQuizzes] = useState([]);
  const [completedQuizzes, setCompletedQuizzes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [reviewAvailability, setReviewAvailability] = useState({});
  const [errorModal, setErrorModal] = useState({ visible: false, title: '', message: '' });
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      loadLiveQuizzes();
    }, [])
  );

  const showError = (title, message) => {
    setErrorModal({ visible: true, title, message });
  };

  const loadLiveQuizzes = async () => {
    setIsLoading(true);
    try {
      const liveRoot = getSafeRootDir().replace('ExamList/', 'LiveTest/');
      const historyKey = 'live_quiz_history';
      const activeKey = 'live_quiz_active_set';

      const historyStr = await AsyncStorage.getItem(historyKey);
      let history = historyStr ? JSON.parse(historyStr) : {};

      // Also check learn_progress for synced live quiz data
      const learnProgressStr = await AsyncStorage.getItem('learn_progress');
      if (learnProgressStr) {
        const learnProgress = JSON.parse(learnProgressStr);
        Object.entries(learnProgress).forEach(([key, val]) => {
          if (key.startsWith('live_')) {
            // Reconstruct the full path to match existing history keys
            // The key format is live_Category_FileName
            const parts = key.split('_');
            if (parts.length >= 3) {
                const cat = parts[1];
                const file = parts.slice(2).join('_');
                const fullPath = `${liveRoot}${cat}/${file}`;
                if (!history[fullPath]) {
                    history[fullPath] = val;
                }
            }
          }
        });
      }

      // Check if directory exists
      const info = await FileSystem.getInfoAsync(liveRoot);
      if (!info.exists) {
        showError("No Live Quizes", "No quiz found! Sync to load data, if still found thsi then no new quizes uploaded yet.");
        setIsLoading(false);
        return;
      }

      const categories = await FileSystem.readDirectoryAsync(liveRoot);
      let allFiles = [];
      for (const cat of categories) {
        const catPath = `${liveRoot}${cat}/`;
        const files = await FileSystem.readDirectoryAsync(catPath);
        for (const file of files) {
          if (file.endsWith('.json')) {
            allFiles.push({
              name: file.replace('.json', '').replace(/_/g, ' '),
              fileName: file,
              category: cat,
              path: `${catPath}${file}`
            });
          }
        }
      }

      if (allFiles.length === 0) {
        showError("No Quizzes Found", "There are currently no live tests available in the directory.");
        setIsLoading(false);
        return;
      }

      const completed = allFiles.filter(f => history[f.path]);
      const available = allFiles.filter(f => !history[f.path]);

      let activeSetStr = await AsyncStorage.getItem(activeKey);
      let activeSet = activeSetStr ? JSON.parse(activeSetStr) : [];
      activeSet = activeSet.filter(path => !history[path]);

      if (activeSet.length < 3 && available.length > 0) {
        const pool = available.filter(f => !activeSet.includes(f.path));
        const shuffled = pool.sort(() => 0.5 - Math.random());
        const needed = 5 - activeSet.length;
        const toAdd = shuffled.slice(0, needed).map(f => f.path);
        activeSet = [...activeSet, ...toAdd];
        await AsyncStorage.setItem(activeKey, JSON.stringify(activeSet));
      }

      const open = activeSet.map(path => allFiles.find(f => f.path === path)).filter(Boolean);
      setOpenQuizzes(open);

      const completedMapped = completed.map(f => ({ ...f, ...history[f.path] }));
      setCompletedQuizzes(completedMapped);

      // Check review availability for completed quizzes
      const availability = {};
      for (const quiz of completedMapped) {
        const reviewKey = `review_${quiz.category}_${quiz.fileName}`;
        const reviewData = await AsyncStorage.getItem(reviewKey);
        availability[quiz.path] = !!reviewData;
      }
      setReviewAvailability(availability);
    } catch (e) {
      console.error(e);
      showError("Load Failed", "An unexpected error occurred while loading the live tests.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuizSelect = (quiz) => {
    router.push({
      pathname: '/quiz/live-test-disclaimer',
      params: {
        quizPath: quiz.path,
        quizName: quiz.name,
        category: quiz.category,
        fileName: quiz.fileName
      }
    });
  };

  const handleReview = async (quiz) => {
    const reviewKey = `review_${quiz.category}_${quiz.fileName}`;
    const reviewData = await AsyncStorage.getItem(reviewKey);
    if (reviewData) {
      router.push({
        pathname: "/quiz/review-screen",
        params: { review: reviewData }
      });
    } else {
      showError("Review Unavailable", "We couldn't find the detailed review data for this specific test.");
    }
  };

  const renderQuizCard = (quiz, isCompleted = false) => (
    <TouchableOpacity
      key={quiz.path}
      style={styles.card}
      onPress={() => !isCompleted && handleQuizSelect(quiz)}
      activeOpacity={isCompleted ? 1 : 0.7}
    >
      <View style={styles.cardIconBox}>
        <MaterialCommunityIcons
          name={isCompleted ? "check-circle" : "lightning-bolt"}
          size={24}
          color={isCompleted ? "#2ECC71" : "#E91E63"}
        />
      </View>
      <View style={styles.cardContent}>
        <Text style={styles.cardTitle} numberOfLines={1}>{quiz.name}</Text>
        <Text style={styles.cardSub}>{quiz.category}</Text>
        {isCompleted && (
          <View>
            <View style={styles.scoreRow}>
              <Text style={styles.scoreLabel}>Score: <Text style={styles.scoreValue}>{quiz.score}/{quiz.total}</Text></Text>
              <Text style={styles.accuracyLabel}>Acc: <Text style={styles.accuracyValue}>{quiz.accuracy || '0'}%</Text></Text>
            </View>
            <View style={styles.cardFooter}>
              <Text style={styles.dateValue}>{new Date(quiz.date).toLocaleDateString()}</Text>
              {reviewAvailability[quiz.path] ? (
                <TouchableOpacity style={styles.reviewMiniBtn} onPress={() => handleReview(quiz)}>
                  <MaterialCommunityIcons name="book-search" size={16} color="#4A90E2" />
                  <Text style={styles.reviewBtnText}>REVIEW</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.reviewMiniBtn, { borderColor: '#E91E63', backgroundColor: '#FFF0F5' }]}
                  onPress={() => handleQuizSelect(quiz)}
                >
                  <MaterialCommunityIcons name="refresh" size={16} color="#E91E63" />
                  <Text style={[styles.reviewBtnText, { color: '#E91E63' }]}>REATTEMPT</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </View>
      {!isCompleted && <MaterialCommunityIcons name="chevron-right" size={24} color="#A4B0BE" />}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={28} color="#2D3436" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Live Test Series</Text>
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'Open' && styles.activeTab]}
          onPress={() => setActiveTab('Open')}
        >
          <Text style={[styles.tabText, activeTab === 'Open' && styles.activeTabText]}>OPEN</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'Completed' && styles.activeTab]}
          onPress={() => setActiveTab('Completed')}
        >
          <Text style={[styles.tabText, activeTab === 'Completed' && styles.activeTabText]}>COMPLETED</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#E91E63" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {activeTab === 'Open' ? (
            openQuizzes.length > 0 ? (
              openQuizzes.map(q => renderQuizCard(q))
            ) : (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="timer-sand-empty" size={80} color="#dfe6e9" />
                <Text style={styles.emptyText}>No live tests available right now.</Text>
                <Text style={styles.emptySub}>Check back later for new updates!</Text>
              </View>
            )
          ) : (
            completedQuizzes.length > 0 ? (
              completedQuizzes.map(q => renderQuizCard(q, true))
            ) : (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="history" size={80} color="#dfe6e9" />
                <Text style={styles.emptyText}>No history found.</Text>
                <Text style={styles.emptySub}>Complete your first live test to see it here!</Text>
              </View>
            )
          )}
        </ScrollView>
      )}

      {/* Beautiful Error/Info Modal */}
      <Modal visible={errorModal.visible} transparent animationType="slide" onRequestClose={() => setErrorModal({ ...errorModal, visible: false })}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconBox}>
              <MaterialCommunityIcons name="alert-circle-outline" size={50} color="#FF7675" />
            </View>
            <Text style={styles.modalTitle}>{errorModal.title}</Text>
            <Text style={styles.modalMessage}>{errorModal.message}</Text>
            <TouchableOpacity
              style={styles.modalBtn}
              onPress={() => {
                setErrorModal({ ...errorModal, visible: false });
                if (errorModal.title !== "Review Unavailable") router.back();
              }}
            >
              <Text style={styles.modalBtnText}>Understood</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F2F6'
  },
  backBtn: { marginRight: 15 },
  headerTitle: { fontSize: 22, fontWeight: '900', color: '#2D3436' },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    paddingHorizontal: 20,
    marginBottom: 10
  },
  tab: {
    flex: 1,
    paddingVertical: 15,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent'
  },
  activeTab: { borderBottomColor: '#E91E63' },
  tabText: { fontSize: 14, fontWeight: '800', color: '#A4B0BE' },
  activeTabText: { color: '#E91E63' },
  list: { padding: 20 },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4
  },
  cardIconBox: {
    width: 50,
    height: 50,
    borderRadius: 15,
    backgroundColor: '#F8F9FA',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15
  },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#2D3436' },
  cardSub: { fontSize: 12, color: '#A4B0BE', fontWeight: '600' },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, alignItems: 'center' },
  scoreLabel: { fontSize: 12, color: '#636E72', fontWeight: '600' },
  scoreValue: { color: '#E91E63', fontWeight: '800' },
  accuracyLabel: { fontSize: 12, color: '#636E72', fontWeight: '600' },
  accuracyValue: { color: '#2ECC71', fontWeight: '800' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  dateValue: { fontSize: 11, color: '#A4B0BE' },
  reviewMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F7FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#4A90E2'
  },
  reviewBtnText: { color: '#4A90E2', fontSize: 10, fontWeight: '900', marginLeft: 5 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyState: { alignItems: 'center', marginTop: 100 },
  emptyText: { marginTop: 15, color: '#2D3436', fontWeight: '900', fontSize: 18 },
  emptySub: { color: '#A4B0BE', fontWeight: '600', marginTop: 5 },

  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 30 },
  modalContent: { backgroundColor: '#FFF', borderRadius: 30, padding: 30, alignItems: 'center', width: '100%', elevation: 10 },
  modalIconBox: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#FFF5F5', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 22, fontWeight: '900', color: '#2D3436', marginBottom: 10 },
  modalMessage: { fontSize: 14, color: '#636E72', textAlign: 'center', lineHeight: 22, marginBottom: 30 },
  modalBtn: { backgroundColor: '#2D3436', paddingVertical: 15, paddingHorizontal: 40, borderRadius: 15, width: '100%', alignItems: 'center' },
  modalBtnText: { color: '#FFF', fontWeight: '900', fontSize: 16 }
});
