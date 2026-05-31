import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

export default function ResultSummary() {
  const router = useRouter();
  const { score, total, attempted, accuracy, timeTaken, sections, review, isLive } = useLocalSearchParams();

  const sectionalData = sections ? JSON.parse(sections) : {};

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* --- PERFORMANCE OVERVIEW --- */}
        <LinearGradient
          colors={isLive === 'true' ? ['#E91E63', '#C2185B'] : ['#6C5CE7', '#4A90E2']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerCard}
        >
          <Text style={styles.headerTitle}>{isLive === 'true' ? 'LIVE TEST RESULT' : 'PERFORMANCE SUMMARY'}</Text>
          <View style={styles.mainStatsRow}>
            <View style={styles.mainStatItem}>
              <MaterialCommunityIcons name="trophy-outline" size={24} color="#FFF" />
              <Text style={styles.mainStatValue}>{score}/{total}</Text>
              <Text style={styles.mainStatLabel}>SCORE</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.mainStatItem}>
              <MaterialCommunityIcons name="pencil-outline" size={24} color="#FFF" />
              <Text style={styles.mainStatValue}>{attempted}/{total}</Text>
              <Text style={styles.mainStatLabel}>ATTEMPTED</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.mainStatItem}>
              <MaterialCommunityIcons name="target" size={24} color="#FFF" />
              <Text style={styles.mainStatValue}>{accuracy}%</Text>
              <Text style={styles.mainStatLabel}>ACCURACY</Text>
            </View>
          </View>

          <View style={styles.timeTakenBadge}>
             <MaterialCommunityIcons name="clock-outline" size={16} color="#FFF" />
             <Text style={styles.timeTakenText}>Time Taken: {timeTaken}</Text>
          </View>
        </LinearGradient>

        {/* --- SECTION WISE ANALYSIS GRID --- */}
        <Text style={styles.subHeader}>SECTIONAL ANALYSIS</Text>
        <View style={styles.gridContainer}>
          {Object.entries(sectionalData).map(([name, data], index) => {
            const secAcc = data.attempted > 0 ? ((data.correct / data.attempted) * 100).toFixed(1) : 0;
            const shadowColors = ['#4A90E2', '#2ECC71', '#F1C40F', '#E74C3C'];
            const shadowColor = shadowColors[index % shadowColors.length];

            return (
              <View key={name} style={[styles.statCard, { shadowColor }]}>
                <MaterialCommunityIcons
                   name="chart-box-outline"
                   size={24}
                   color={shadowColor}
                   style={{ marginBottom: 8 }}
                />
                <Text style={styles.secName} numberOfLines={1}>{name.toUpperCase()}</Text>
                <Text style={styles.secAccValue}>{secAcc}%</Text>
                <Text style={styles.secDetailsText}>{data.correct} / {data.total}</Text>
              </View>
            );
          })}
        </View>

        {/* --- ACTIONS --- */}
        <View style={styles.actionContainer}>
          <TouchableOpacity
            style={[styles.btn, styles.reviewBtn]}
            onPress={() => router.push({
              pathname: "/quiz/review-screen",
              params: { review: review }
            })}
          >
            <MaterialCommunityIcons name="book-search" size={24} color="#2196F3" />
            <Text style={[styles.btnText, {color: '#2196F3'}]}>REVIEW QUESTIONS</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.btn, styles.homeBtn]} onPress={() => router.replace('/')}>
            <MaterialCommunityIcons name="home" size={24} color="#6C5CE7" />
            <Text style={[styles.btnText, {color: '#6C5CE7'}]}>RETURN HOME</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 50 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F3F7' },
  scrollContent: { padding: 20 },
  headerCard: {
    padding: 25,
    borderRadius: 30,
    marginBottom: 30,
    elevation: 15,
    shadowColor: '#6C5CE7',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    alignItems: 'center'
  },
  headerTitle: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '900', marginBottom: 20, letterSpacing: 2 },
  mainStatsRow: { flexDirection: 'row', width: '100%', justifyContent: 'space-between', alignItems: 'center' },
  mainStatItem: { alignItems: 'center', flex: 1 },
  mainStatValue: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', marginTop: 8 },
  mainStatLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 9, fontWeight: '800', marginTop: 4, letterSpacing: 1 },
  divider: { width: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.2)' },
  timeTakenBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 25
  },
  timeTakenText: { color: '#FFF', fontSize: 12, fontWeight: '700', marginLeft: 6 },
  subHeader: { fontSize: 14, fontWeight: '900', color: '#2D3436', marginBottom: 15, marginLeft: 5, letterSpacing: 0.8 },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20
  },
  statCard: {
    width: '47%',
    aspectRatio: 1,
    backgroundColor: '#FFF',
    borderRadius: 25,
    padding: 15,
    marginBottom: 18,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  secName: { fontSize: 11, fontWeight: '900', color: '#7F8C8D', marginBottom: 5, textAlign: 'center' },
  secAccValue: { fontSize: 24, fontWeight: '900', color: '#2D3436' },
  secDetailsText: { fontSize: 12, color: '#A4B0BE', fontWeight: '700', marginTop: 4 },
  actionContainer: { gap: 15 },
  btn: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    padding: 18,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 12
  },
  reviewBtn: { shadowColor: '#4A90E2' },
  homeBtn: { shadowColor: '#6C5CE7' },
  btnText: { fontWeight: '900', marginLeft: 10, fontSize: 14, letterSpacing: 1 }
});
