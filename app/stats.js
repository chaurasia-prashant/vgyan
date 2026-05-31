import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function Statistics() {
  const insets = useSafeAreaInsets();
  const [history, setHistory] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [expandedWeekly, setExpandedWeekly] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const histData = await AsyncStorage.getItem('quiz_history');
    if (histData) setHistory(JSON.parse(histData));

    const analytData = await AsyncStorage.getItem('user_analytics');
    if (analytData) setAnalytics(JSON.parse(analytData));
  };

  // 1. UNIQUE FINISHED TESTS (Excluding Re-attempts)
  const uniqueFinished = new Set(history.map(item => item.quizId)).size;

  // 2. ACCURACY (Last 7 Days Only)
  const now = new Date();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const lastSevenDaysHistory = history.filter(item => new Date(item.date) > sevenDaysAgo);
  const weeklyAcc = lastSevenDaysHistory.length > 0
    ? (lastSevenDaysHistory.reduce((sum, item) => sum + parseFloat(item.accuracy), 0) / lastSevenDaysHistory.length).toFixed(1)
    : 0;

  // 3. WEEKLY ACTIVITY DATA
  const weeklyTestsCount = lastSevenDaysHistory.length;
  const weeklySections = {};
  const sectionStats = {};

  history.forEach(attempt => {
    Object.entries(attempt.sections || {}).forEach(([name, data]) => {
      if (!sectionStats[name]) sectionStats[name] = { correct: 0, attempted: 0 };
      sectionStats[name].correct += data.correct;
      sectionStats[name].attempted += data.attempted;
    });
  });

  lastSevenDaysHistory.forEach(attempt => {
    Object.entries(attempt.sections || {}).forEach(([name, data]) => {
      if (!weeklySections[name]) weeklySections[name] = { correct: 0, attempted: 0, tests: 0 };
      weeklySections[name].correct += data.correct;
      weeklySections[name].attempted += data.attempted;
      weeklySections[name].tests += 1;
    });
  });

  // 4. DAILY GOAL CARD (Current Day)
  const today = new Date().toLocaleDateString();
  const todayHistory = history.filter(item => new Date(item.date).toLocaleDateString() === today);
  const todayTests = todayHistory.length;
  const todayReattempts = todayHistory.reduce((sum, item) => sum + Math.max(0, (item.totalAttempts || 1) - 1), 0);

  // Weekly Reattempts
  const weeklyReattempts = lastSevenDaysHistory.reduce((sum, item) => sum + Math.max(0, (item.totalAttempts || 1) - 1), 0);

  // All Time Section Stats enhancement
  const sectionStatsEnhanced = {};
  history.forEach(attempt => {
    Object.entries(attempt.sections || {}).forEach(([name, data]) => {
      if (!sectionStatsEnhanced[name]) {
        sectionStatsEnhanced[name] = {
          correct: 0,
          attempted: 0,
          totalTests: 0,
          reattempts: 0,
          recentAccuracies: []
        };
      }
      sectionStatsEnhanced[name].correct += data.correct;
      sectionStatsEnhanced[name].attempted += data.attempted;
      sectionStatsEnhanced[name].totalTests += 1;
      sectionStatsEnhanced[name].reattempts += Math.max(0, (attempt.totalAttempts || 1) - 1);

      // Track last 7 accuracies for this section
      const quizAccuracy = (data.correct / data.attempted) * 100;
      sectionStatsEnhanced[name].recentAccuracies.push(quizAccuracy);
    });
  });

  // Calculate average of last 7 for each section
  Object.keys(sectionStatsEnhanced).forEach(name => {
    const accs = sectionStatsEnhanced[name].recentAccuracies;
    const last7 = accs.slice(-7);
    sectionStatsEnhanced[name].last7Avg = last7.length > 0
      ? (last7.reduce((a, b) => a + b, 0) / last7.length).toFixed(1)
      : 0;
  });

  const StatCard = ({ label, value, icon, color }) => (
    <View style={[styles.statCard, { shadowColor: color }]}>
      <View style={[styles.iconCircle, { backgroundColor: color + '15' }]}>
        <MaterialCommunityIcons name={icon} size={24} color={color} />
      </View>
      <Text style={styles.statVal}>{value}</Text>
      <Text style={styles.statLab}>{label.toUpperCase()}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={[styles.headerRow, { paddingTop: insets.top + 20 }]}>
        <Text style={styles.header}>PERFORMANCE HUB</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 30 }]}
      >
        <View style={styles.grid}>
          <StatCard
            label="Practice Tests"
            value={uniqueFinished}
            icon="clipboard-check-outline"
            color="#9C27B0"
          />
          <StatCard
            label="Live Tests"
            value={analytics?.live_test_record?.total_test || 0}
            icon="medal-outline"
            color="#E91E63"
          />
        </View>

        <View style={styles.grid}>
          <StatCard
            label="7-Day Acc."
            value={`${weeklyAcc}%`}
            icon="target"
            color="#2ECC71"
          />
          <StatCard
            label="Weekly Activity"
            value={`${analytics?.activity || 0}m`}
            icon="clock-check-outline"
            color="#00CEC9"
          />
        </View>

        {/* DAILY GOAL CARD */}
        <View style={styles.dailyCard}>
          <View style={styles.dailyHeader}>
            <View>
              <Text style={styles.dailyTitle}>DAILY PROGRESS</Text>
              <Text style={styles.dailyDate}>{new Date().toDateString().toUpperCase()}</Text>
            </View>
            <View style={styles.dailyCountBadge}>
              <Text style={styles.dailyCountText}>
                {todayTests} TOPIC | {analytics?.live_test_record?.total_test || 0} LIVE
              </Text>
            </View>
          </View>

          {todayHistory.length > 0 ? (
            <View style={styles.todayTopicsRow}>
              {todayHistory.slice(0, 4).map((item, idx) => (
                <View key={idx} style={styles.todayTopicItem}>
                  <Text style={styles.todayTopicName} numberOfLines={1}>{item.quizName.replace('.json', '').replace(/_/g, ' ')}</Text>
                  <Text style={styles.todayTopicAcc}>{item.accuracy}%</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.dailyEmpty}>No activity yet today. Start a quiz!</Text>
          )}
        </View>

        <TouchableOpacity
          activeOpacity={0.9}
          style={styles.weeklyCard}
          onPress={() => setExpandedWeekly(!expandedWeekly)}
        >
          <View style={styles.weeklyHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <MaterialCommunityIcons name="calendar-range" size={24} color="#FFF" />
              <Text style={styles.weeklyTitle}>WEEKLY ACTIVITY</Text>
            </View>
            <MaterialCommunityIcons name={expandedWeekly ? "chevron-up" : "chevron-down"} size={20} color="#B2BEC3" />
          </View>
          <View style={styles.weeklyContent}>
            <Text style={styles.weeklyVal}>{weeklyTestsCount + (analytics?.live_test_record?.total_test || 0)}</Text>
            <View style={{ marginLeft: 15 }}>
              <Text style={styles.weeklySub}>Total Tests | {analytics?.activity || 0}m Active</Text>
              <Text style={styles.weeklyPeriod}>LAST 7 DAYS ACTIVITY</Text>
            </View>
          </View>

          {expandedWeekly && (
            <View style={styles.expandedContent}>
              <View style={styles.expandedDivider} />
              {Object.entries(weeklySections).map(([name, data]) => {
                const acc = ((data.correct / (data.attempted || 1)) * 100).toFixed(0);
                return (
                  <View key={name} style={styles.weeklySectionBox}>
                    <Text style={styles.weeklySectionName} numberOfLines={1}>{name.toUpperCase()}</Text>
                    <View style={styles.weeklySectionStats}>
                      <View style={styles.weeklyMiniBox}>
                        <MaterialCommunityIcons name="file-document-outline" size={12} color="#B2BEC3" />
                        <Text style={styles.weeklyMiniText}>{data.tests} Tests</Text>
                      </View>
                      <View style={[styles.weeklyMiniBox, { backgroundColor: acc > 75 ? 'rgba(46, 204, 113, 0.1)' : 'rgba(241, 196, 15, 0.1)' }]}>
                        <MaterialCommunityIcons name="check-circle-outline" size={12} color={acc > 75 ? '#2ECC71' : '#F1C40F'} />
                        <Text style={[styles.weeklyMiniText, { color: acc > 75 ? '#2ECC71' : '#F1C40F' }]}>{acc}%</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
              {Object.entries(weeklySections).length === 0 && (
                <Text style={styles.expandedEmpty}>No tests in the last 7 days.</Text>
              )}
            </View>
          )}
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>ALL-TIME STRENGTHS</Text>
        <View style={styles.sectionCardsGrid}>
          {Object.entries(sectionStatsEnhanced).length > 0 ? (
            Object.entries(sectionStatsEnhanced).map(([name, data]) => {
              const acc = data.last7Avg;
              const themeColor = acc > 80 ? '#2ECC71' : (acc > 50 ? '#F1C40F' : '#FF7675');
              return (
                <View key={name} style={styles.sectionDetailCard}>
                  <View style={styles.sectionDetailHeader}>
                    <View style={[styles.sectionIconBox, { backgroundColor: themeColor + '15' }]}>
                      <MaterialCommunityIcons
                        name={acc > 80 ? "medal" : "trending-up"}
                        size={20}
                        color={themeColor}
                      />
                    </View>
                    <Text style={styles.sectionName} numberOfLines={1}>{name.toUpperCase()}</Text>
                    <View style={[styles.accBadge, { backgroundColor: themeColor + '15' }]}>
                      <Text style={[styles.accBadgeText, { color: themeColor }]}>{Math.round(acc)}%</Text>
                    </View>
                  </View>

                  <View style={styles.sectionDetailGrid}>
                    <View style={styles.detailBox}>
                      <MaterialCommunityIcons name="clipboard-list-outline" size={16} color="#7F8C8D" />
                      <View>
                        <Text style={styles.detailValue}>{data.totalTests}</Text>
                        <Text style={styles.detailLabel}>TESTS</Text>
                      </View>
                    </View>
                    <View style={styles.detailBox}>
                      <MaterialCommunityIcons name="cached" size={16} color="#7F8C8D" />
                      <View>
                        <Text style={styles.detailValue}>{data.reattempts}</Text>
                        <Text style={styles.detailLabel}>RETAKES</Text>
                      </View>
                    </View>
                    <View style={styles.detailBox}>
                      <MaterialCommunityIcons name="target" size={16} color="#7F8C8D" />
                      <View>
                        <Text style={styles.detailValue}>{Math.round((data.correct / (data.attempted || 1)) * 100)}%</Text>
                        <Text style={styles.detailLabel}>OVERALL</Text>
                      </View>
                    </View>
                  </View>
                </View>
              );
            })
          ) : (
            <View style={styles.emptySubjects}>
              <MaterialCommunityIcons name="chart-line-variant" size={50} color="#E0E0E0" />
              <Text style={styles.emptyText}>ATTEMPT A QUIZ TO SEE ANALYTICS</Text>
            </View>
          )}
        </View>
      </ScrollView>
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
    shadowColor: '#9C27B0',
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
  scroll: { padding: 20, paddingTop: 30 },
  grid: { flexDirection: 'row', gap: 15, marginBottom: 25 },
  statCard: {
    flex: 1,
    backgroundColor: '#FFF',
    padding: 22,
    borderRadius: 30,
    elevation: 8,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 15
  },
  iconCircle: {
    width: 50, height: 50, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center', marginBottom: 12
  },
  statVal: { fontSize: 24, fontWeight: '900', color: '#2D3436' },
  statLab: { fontSize: 10, color: '#A4B0BE', fontWeight: '800', marginTop: 4, letterSpacing: 0.8 },
  weeklyCard: {
    backgroundColor: '#2D3436',
    padding: 25,
    borderRadius: 35,
    marginBottom: 30,
    elevation: 10,
    shadowColor: '#2D3436',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20
  },
  weeklyHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 15 },
  weeklyTitle: { color: '#B2BEC3', fontSize: 12, fontWeight: '900', letterSpacing: 1.5 },
  weeklyContent: { flexDirection: 'row', alignItems: 'center' },
  weeklyVal: { color: '#FFF', fontSize: 48, fontWeight: '900' },
  weeklySub: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  weeklyPeriod: { color: '#2ECC71', fontSize: 10, fontWeight: '900', letterSpacing: 1, marginTop: 2 },
  sectionTitle: { fontSize: 14, fontWeight: '900', color: '#2D3436', marginBottom: 15, marginLeft: 5, letterSpacing: 1 },
  sectionCardsGrid: { gap: 12 },
  sectionDetailCard: {
    backgroundColor: '#FFF',
    borderRadius: 28,
    padding: 20,
    marginBottom: 15,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  sectionDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  accBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
    marginLeft: 'auto'
  },
  accBadgeText: {
    fontSize: 14,
    fontWeight: '900',
  },
  sectionDetailGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  detailBox: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    borderRadius: 18,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '900',
    color: '#2D3436',
  },
  detailLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: '#A4B0BE',
    letterSpacing: 0.5
  },
  sectionIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15
  },
  sectionName: {
    fontSize: 13,
    fontWeight: '900',
    color: '#2D3436',
    letterSpacing: 0.5,
    flex: 1
  },
  emptySubjects: { alignItems: 'center', paddingVertical: 20 },
  emptyText: { fontSize: 10, fontWeight: '900', color: '#B2BEC3', marginTop: 15, letterSpacing: 1 },

  // Daily Card Styles
  dailyCard: {
    backgroundColor: '#FFF',
    padding: 25,
    borderRadius: 35,
    marginBottom: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10
  },
  dailyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20
  },
  dailyTitle: { fontSize: 10, fontWeight: '900', color: '#A4B0BE', letterSpacing: 1 },
  dailyDate: { fontSize: 16, fontWeight: '900', color: '#2D3436', marginTop: 2 },
  dailyCountBadge: {
    backgroundColor: '#F0F7FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12
  },
  dailyCountText: { fontSize: 10, fontWeight: '900', color: '#4A90E2' },
  todayTopicsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  todayTopicItem: {
    backgroundColor: '#F8F9FA',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 15,
    alignItems: 'center',
    minWidth: 70
  },
  todayTopicName: { fontSize: 9, fontWeight: '800', color: '#636E72', marginBottom: 2 },
  todayTopicAcc: { fontSize: 14, fontWeight: '900', color: '#2D3436' },
  dailyEmpty: { fontSize: 12, color: '#B2BEC3', fontStyle: 'italic', textAlign: 'center', paddingVertical: 10 },

  // Expanded Weekly Styles
  expandedContent: { marginTop: 15 },
  expandedDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: 15 },
  weeklySectionBox: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    padding: 15,
    marginBottom: 10,
  },
  weeklySectionName: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 8,
    letterSpacing: 0.5
  },
  weeklySectionStats: {
    flexDirection: 'row',
    gap: 10
  },
  weeklyMiniBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10
  },
  weeklyMiniText: {
    color: '#B2BEC3',
    fontSize: 10,
    fontWeight: '700'
  },
  expandedEmpty: { color: '#636E72', fontSize: 11, fontStyle: 'italic', textAlign: 'center' }
});
