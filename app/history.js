import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useNavigation } from 'expo-router';

export default function History() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const [history, setHistory] = useState([]);

  useEffect(() => {
    loadHistory();
    const unsubscribe = navigation.addListener('focus', loadHistory);
    return unsubscribe;
  }, [navigation]);

  const loadHistory = async () => {
    try {
      const data = await AsyncStorage.getItem('quiz_history');
      if (data && data.trim()) {
        const parsed = JSON.parse(data.replace(/^\uFEFF/, '').trim());
        if (!Array.isArray(parsed)) return;

        // Filter for last 3 months
        const cutoffDate = new Date();
        cutoffDate.setMonth(cutoffDate.getMonth() - 3);

        const filtered = parsed.filter(item => {
          if (!item.date) return false;
          const itemDate = new Date(item.date);
          return !isNaN(itemDate.getTime()) && itemDate >= cutoffDate;
        });

        // Sort by date descending
        const sorted = [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date));
        setHistory(sorted);

        // ALWAYS update storage if items were filtered out
        if (filtered.length !== parsed.length) {
          await AsyncStorage.setItem('quiz_history', JSON.stringify(filtered));
        }
      } else {
        setHistory([]);
      }
    } catch (error) {
      console.error("Error loading history:", error);
    }
  };

  const renderHistoryItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.iconBox}>
          <MaterialCommunityIcons name="clipboard-check-outline" size={24} color="#6C5CE7" />
        </View>
        <View style={{ flex: 1, marginLeft: 15 }}>
          <Text style={styles.quizName} numberOfLines={1}>
            {item.quizName.replace('.json', '').replace(/_/g, ' ').toUpperCase()}
          </Text>
          <Text style={styles.categoryTag}>{item.category.toUpperCase()}</Text>
        </View>
        <View style={styles.scoreBadge}>
          <Text style={styles.scoreText}>{item.score}</Text>
          <Text style={styles.totalText}>/{item.total}</Text>
        </View>
      </View>

      <View style={styles.metricsRow}>
        <View style={styles.metric}>
          <MaterialCommunityIcons name="bullseye-arrow" size={14} color="#2ECC71" />
          <Text style={styles.metricText}>{item.accuracy}%</Text>
        </View>
        <View style={styles.metric}>
          <MaterialCommunityIcons name="refresh" size={14} color="#6C5CE7" />
          <Text style={styles.metricText}>ATTEMPT #{item.totalAttempts || 1}</Text>
        </View>
        <View style={styles.metric}>
          <MaterialCommunityIcons name="calendar-clock" size={14} color="#A4B0BE" />
          <Text style={styles.metricText}>{new Date(item.date).toLocaleDateString()}</Text>
        </View>
      </View>

      <View style={styles.divider} />
      
      <View style={styles.sectionGrid}>
        {Object.entries(item.sections || {}).slice(0, 4).map(([name, data], idx) => (
          <View key={name} style={styles.miniSec}>
            <Text style={styles.miniSecName} numberOfLines={1}>{name.toUpperCase()}</Text>
            <Text style={styles.miniSecScore}>{data.correct}/{data.total}</Text>
          </View>
        ))}
      </View>

      {parseFloat(item.accuracy) < 100 ? (
        <TouchableOpacity
          style={styles.reviewBtn}
          onPress={async () => {
            const reviewData = await AsyncStorage.getItem(`review_${item.quizId}`);
            if (reviewData) {
              router.push({
                pathname: "/quiz/review-screen",
                params: { review: reviewData }
              });
            } else {
              alert("Review data no longer available for this attempt.");
            }
          }}
        >
          <MaterialCommunityIcons name="book-search" size={20} color="#6C5CE7" />
          <Text style={styles.reviewBtnText}>REVIEW ATTEMPT</Text>
        </TouchableOpacity>
      ) : (
        <View style={[styles.reviewBtn, { backgroundColor: '#E8F2FF', borderColor: '#4A90E2' }]}>
          <MaterialCommunityIcons name="trophy" size={20} color="#4A90E2" />
          <Text style={[styles.reviewBtnText, { color: '#4A90E2' }]}>PERFECT SCORE! 100%</Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={[styles.headerRow, { paddingTop: insets.top + 20 }]}>
        <Text style={styles.header}>ATTEMPT HISTORY</Text>
      </View>

      <FlatList
        data={history}
        keyExtractor={(item) => item.id || Math.random().toString()}
        renderItem={renderHistoryItem}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <MaterialCommunityIcons name="history" size={80} color="#E0E0E0" />
            <Text style={styles.emptyText}>NO ATTEMPTS YET</Text>
            <TouchableOpacity
              style={styles.startBtn}
              onPress={() => router.push('/quiz/select-exam')}
            >
              <Text style={styles.startBtnText}>START YOUR FIRST QUIZ</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F3F7' },
  headerRow: {
    paddingHorizontal: 25,
    paddingBottom: 30,
    backgroundColor: '#FFF',
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    elevation: 12,
    shadowColor: '#6C5CE7',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    alignItems: 'center',
    zIndex: 10
  },
  header: {
    fontSize: 24,
    fontWeight: '900',
    color: '#1A1A1A',
    letterSpacing: 1,
    textAlign: 'center'
  },
  listContent: { padding: 20, paddingTop: 30 },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 30,
    padding: 22,
    marginBottom: 20,
    elevation: 8,
    shadowColor: '#6C5CE7',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 15
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  iconBox: {
    width: 48, height: 48, borderRadius: 16,
    backgroundColor: '#F3F0FF', justifyContent: 'center', alignItems: 'center'
  },
  quizName: { fontSize: 15, fontWeight: '900', color: '#2D3436', letterSpacing: 0.5 },
  categoryTag: { fontSize: 10, fontWeight: '800', color: '#A4B0BE', marginTop: 2, letterSpacing: 0.8 },
  scoreBadge: { flexDirection: 'row', alignItems: 'baseline', backgroundColor: '#F1F2F6', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  scoreText: { fontSize: 18, fontWeight: '900', color: '#6C5CE7' },
  totalText: { fontSize: 12, fontWeight: '800', color: '#A4B0BE' },
  metricsRow: { flexDirection: 'row', gap: 15, marginBottom: 15 },
  metric: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metricText: { fontSize: 10, fontWeight: '900', color: '#7F8C8D', letterSpacing: 0.5 },
  divider: { height: 1, backgroundColor: '#F8F9FA', marginBottom: 15 },
  sectionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  miniSec: {
    backgroundColor: '#F8F9FA',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    flex: 1,
    minWidth: '45%',
    borderWidth: 1,
    borderColor: '#F1F2F6'
  },
  miniSecName: { fontSize: 9, fontWeight: '800', color: '#A4B0BE', marginBottom: 2 },
  miniSecScore: { fontSize: 12, fontWeight: '900', color: '#2D3436' },
  emptyBox: { alignItems: 'center', marginTop: 100 },
  emptyText: { fontSize: 16, fontWeight: '900', color: '#B2BEC3', marginTop: 20, letterSpacing: 1 },
  startBtn: {
    marginTop: 25,
    backgroundColor: '#6C5CE7',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 20,
    elevation: 5,
    shadowColor: '#6C5CE7',
    shadowOpacity: 0.3,
    shadowRadius: 10
  },
  startBtnText: { color: '#FFF', fontWeight: '900', fontSize: 14, letterSpacing: 1 },
  reviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    paddingVertical: 12,
    backgroundColor: '#F3F0FF',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#E0D7FF'
  },
  reviewBtnText: {
    marginLeft: 8,
    fontSize: 12,
    fontWeight: '900',
    color: '#6C5CE7',
    letterSpacing: 0.5
  }
});
