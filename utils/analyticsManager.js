import AsyncStorage from '@react-native-async-storage/async-storage';

const ANALYTICS_KEY = 'user_analytics';

export const getWeeklyDateRange = () => {
    const now = new Date();
    const day = now.getDay(); // 0 (Sun) to 6 (Sat)
    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
    const monday = new Date(now.setDate(diff));
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const format = (d) => `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
    return `${format(monday)} - ${format(sunday)}`;
};

export const checkWeeklyReset = async () => {
    const currentRange = getWeeklyDateRange();
    const savedRange = await AsyncStorage.getItem('analytics_week_range');
    const userName = await AsyncStorage.getItem('user_name');

    if (!userName) return null; // Prevent creating 'Unknown' records

    if (savedRange !== currentRange) {
        // Reset analytics for the new week
        const emptyAnalytics = {
            data_date: currentRange,
            username: userName || 'Unknown',
            live_test_record: { score: 0, accuracy: 0, total_test: 0 },
            subjective_record: { total_test: 0, reattempts: 0, score: 0 },
            section_wisescore: {},
            activity: 0 // in minutes
        };
        await AsyncStorage.setItem(ANALYTICS_KEY, JSON.stringify(emptyAnalytics));
        await AsyncStorage.setItem('analytics_week_range', currentRange);
        return emptyAnalytics;
    }

    const data = await AsyncStorage.getItem(ANALYTICS_KEY);
    if (!data) {
        return {
            data_date: currentRange,
            username: userName,
            live_test_record: { score: 0, accuracy: 0, total_test: 0 },
            subjective_record: { total_test: 0, reattempts: 0, score: 0 },
            section_wisescore: {},
            activity: 0
        };
    }
    const parsed = JSON.parse(data);
    // Fix existing 'Unknown' if we have a valid username now
    if (parsed.username === 'Unknown' && userName) {
        parsed.username = userName;
        await AsyncStorage.setItem(ANALYTICS_KEY, JSON.stringify(parsed));
    }
    return parsed;
};

export const updateLiveTestAnalytics = async (score, accuracy) => {
    let data = await checkWeeklyReset();
    if (!data) return;
    const record = data.live_test_record;
    const newTotal = record.total_test + 1;

    // Average accuracy calculation
    const currentAcc = parseFloat(accuracy) || 0;
    const newAccuracy = ((record.accuracy * record.total_test) + currentAcc) / newTotal;

    data.live_test_record = {
        score: record.score + score,
        accuracy: parseFloat(newAccuracy.toFixed(1)),
        total_test: newTotal
    };

    await AsyncStorage.setItem(ANALYTICS_KEY, JSON.stringify(data));
};

export const updateSubjectiveAnalytics = async (quizId, score, sectionsData, isFirstAttempt) => {
    let data = await checkWeeklyReset();
    if (!data) return;
    const record = data.subjective_record;

    if (isFirstAttempt) {
        record.total_test += 1;
        record.score += score;
    } else {
        // Reattempt logic: score added = (current score - last score - 2)
        const lastScoreKey = `last_score_${quizId}`;
        const lastScoreStr = await AsyncStorage.getItem(lastScoreKey);
        const lastScore = lastScoreStr ? parseInt(lastScoreStr) : 0;

        record.reattempts += 1;
        record.score += (score - lastScore - 2);
    }

    // Store this score for next reattempt calculation
    await AsyncStorage.setItem(`last_score_${quizId}`, score.toString());

    // Section-wise stats
    Object.entries(sectionsData).forEach(([secName, secData]) => {
        if (!data.section_wisescore[secName]) {
            data.section_wisescore[secName] = { total_tests: 0, avg_accuracy: 0 };
        }

        const secRecord = data.section_wisescore[secName];
        const newSecTotal = secRecord.total_tests + 1;
        const currentAcc = secData.attempted > 0 ? (secData.correct / secData.attempted) * 100 : 0;
        const newSecAcc = ((secRecord.avg_accuracy * secRecord.total_tests) + currentAcc) / newSecTotal;

        data.section_wisescore[secName] = {
            total_tests: newSecTotal,
            avg_accuracy: parseFloat(newSecAcc.toFixed(1))
        };
    });

    data.subjective_record = record;
    await AsyncStorage.setItem(ANALYTICS_KEY, JSON.stringify(data));
};

export const updateActivityMinutes = async (minutes) => {
    if (minutes <= 0) return;
    let data = await checkWeeklyReset();
    if (!data) return;
    data.activity = (data.activity || 0) + minutes;
    await AsyncStorage.setItem(ANALYTICS_KEY, JSON.stringify(data));
};
