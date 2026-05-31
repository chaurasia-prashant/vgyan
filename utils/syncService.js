import AsyncStorage from '@react-native-async-storage/async-storage';

// GitHub Configuration
export const GITHUB_USERNAME = process.env.EXPO_PUBLIC_GITHUB_USERNAME || "chaurasia-prashant";
export const REPO_NAME = process.env.EXPO_PUBLIC_REPO_NAME || "quizFiles";
export const USERS_REPO_NAME = process.env.EXPO_PUBLIC_USERS_REPO_NAME || "quiz_users";
export const GITHUB_TOKEN = process.env.EXPO_PUBLIC_GITHUB_TOKEN || '';
export const USERS_FILE_URL = `https://api.github.com/repos/${GITHUB_USERNAME}/${USERS_REPO_NAME}/contents/users.json`;
export const LEADERBOARD_FILE_URL = `https://api.github.com/repos/${GITHUB_USERNAME}/${USERS_REPO_NAME}/contents/leaderboard_data.json`;

const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
export const b64_encode = (input) => {
  let str = String(input);
  let output = '';
  for (let block = 0, charCode, i = 0, map = chars; str.charAt(i | 0) || (map = '=', i % 1); output += map.charAt(63 & block >> 8 - i % 1 * 8)) {
    charCode = str.charCodeAt(i += 3 / 4);
    block = block << 8 | charCode;
  }
  return output;
};

export const b64_decode = (input) => {
  if (!input) return "";
  let str = String(input).replace(/=+$/, '');
  let output = '';
  for (let bc = 0, bs = 0, buffer, i = 0; (buffer = str.charAt(i++)) && chars.indexOf(buffer) !== -1; ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) {
    buffer = chars.indexOf(buffer);
  }
  return output;
};

export const getUserDataUrl = (username) =>
  `https://api.github.com/repos/${GITHUB_USERNAME}/${USERS_REPO_NAME}/contents/users_data/${username.toUpperCase().trim()}.json`;

export const pullAppStatus = async () => {
  try {
    const savedName = await AsyncStorage.getItem('user_name');
    if (!savedName) return;

    const userDataUrl = getUserDataUrl(savedName);
    const res = await fetch(`${userDataUrl}?t=${new Date().getTime()}`, {
      headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
    });

    if (res.ok) {
      const data = await res.json();
      const decoded = b64_decode(data.content.replace(/\s/g, ''));
      if (decoded && decoded.trim()) {
        const statusObj = JSON.parse(decoded.replace(/^\uFEFF/, '').trim());

        if (statusObj.current_progress) {
          await AsyncStorage.setItem('learn_progress', JSON.stringify(statusObj.current_progress));

          // Reconstruct live_quiz_history from current_progress
          const liveHistory = {};
          Object.entries(statusObj.current_progress).forEach(([key, val]) => {
            if (key.startsWith('live_')) {
              liveHistory[key] = val;
            }
          });
          if (Object.keys(liveHistory).length > 0) {
            await AsyncStorage.setItem('live_quiz_history', JSON.stringify(liveHistory));
          }
        }

        if (statusObj.user_analytics) {
          await AsyncStorage.setItem('user_analytics', JSON.stringify(statusObj.user_analytics));
          if (statusObj.user_analytics.data_date) {
            await AsyncStorage.setItem('analytics_week_range', statusObj.user_analytics.data_date);
          }
        }

        if (statusObj.analytics_week_range) {
          await AsyncStorage.setItem('analytics_week_range', statusObj.analytics_week_range);
        }

        // IMPORTANT: Update last_pushed_status to prevent redundant syncAppStatus later
        await AsyncStorage.setItem('last_pushed_status', JSON.stringify(statusObj));
      }
    }
  } catch (e) {
    // console.error("Pull failed", e);
  }
};

export const syncAppStatus = async (force = false) => {
  try {
    const savedName = await AsyncStorage.getItem('user_name');
    const savedAccess = await AsyncStorage.getItem('user_access');
    if (!savedName || !savedAccess) return;

    const learnProgress = await AsyncStorage.getItem('learn_progress');
    let parsedLearnProgress = {};
    if (learnProgress && learnProgress.trim()) {
      try {
        parsedLearnProgress = JSON.parse(learnProgress.replace(/^\uFEFF/, '').trim());
      } catch (e) {
        // Silently handle parse errors in background sync
      }
    }

    const userAnalyticsStr = await AsyncStorage.getItem('user_analytics');
    const userAnalytics = userAnalyticsStr ? JSON.parse(userAnalyticsStr) : null;
    const weekRange = await AsyncStorage.getItem('analytics_week_range');

    const currentAppStatus = {
      current_progress: {
        ...parsedLearnProgress
      },
      user_analytics: userAnalytics,
      analytics_week_range: weekRange
    };

    const lastPushedStatus = await AsyncStorage.getItem('last_pushed_status');
    const statusString = JSON.stringify(currentAppStatus);

    if (!force && lastPushedStatus === statusString) {
      // Even if progress hasn't changed, we might need to sync analytics to leaderboard
      if (userAnalytics) {
        await updateLeaderboard(userAnalytics);
      }
      return;
    }

    const userDataUrl = getUserDataUrl(savedName);
    const res = await fetch(`${userDataUrl}?t=${new Date().getTime()}`, {
      headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
    });

    let sha = null;
    if (res.ok) {
      const data = await res.json();
      sha = data.sha;
    } else if (res.status !== 404) {
      return;
    }

    const updateRes = await fetch(userDataUrl, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Update app_status for ${savedName}`,
        content: b64_encode(JSON.stringify(currentAppStatus, null, 2)),
        ...(sha ? { sha } : {})
      })
    });

    if (updateRes.ok || updateRes.status === 201) {
        await AsyncStorage.setItem('last_pushed_status', statusString);
        // Sync analytics to leaderboard
        if (userAnalytics) {
          await updateLeaderboard(userAnalytics);
        }
    } else if (userAnalytics) {
       // If progress update fails, still try to update leaderboard
       await updateLeaderboard(userAnalytics);
    }
  } catch (e) {
    // Cloud status sync failed
  }
};

const updateLeaderboard = async (userAnalytics) => {
  try {
    const res = await fetch(`${LEADERBOARD_FILE_URL}?t=${new Date().getTime()}`, {
      headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
    });

    if (!res.ok) {
        // Silently fail without throwing a Type Error if network is down or repo inaccessible
        return;
    }

    let leaderboard = [];
    let sha = null;

    const data = await res.json();
    sha = data.sha;
    const decoded = b64_decode(data.content.replace(/\s/g, ''));
    leaderboard = JSON.parse(decoded);

    // Replace or add user data
    // Check if cloud leaderboard matches current week range
    if (leaderboard.length > 0 && leaderboard[0].data_date !== userAnalytics.data_date) {
        // Cloud data is from a previous week, reset it but KEEP current user
        leaderboard = [userAnalytics];
    } else {
        const userIdx = leaderboard.findIndex(u => u.username === userAnalytics.username);
        if (userIdx !== -1) {
            leaderboard[userIdx] = userAnalytics;
        } else {
            leaderboard.push(userAnalytics);
        }
    }

    await fetch(LEADERBOARD_FILE_URL, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Update leaderboard for ${userAnalytics.username}`,
        content: b64_encode(JSON.stringify(leaderboard, null, 2)),
        ...(sha ? { sha } : {})
      })
    });
  } catch (e) {
    // Suppress console errors for background network failures to keep UI clean
    // console.error("Leaderboard update failed", e);
  }
};
