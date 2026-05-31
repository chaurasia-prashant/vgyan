<p align="center">
  <img src="assets/logo.svg" width="80" height="80" alt="VGyan Logo" />
</p>

<h1 align="center">🎓 VGyan</h1>

<p align="center">
  <strong>The Ultimate Learning Companion for Indian Competitive Exams</strong>
  <br />
  <i>Precision, Speed, and Conceptual Clarity in your pocket.</i>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Android-3DDC84?style=for-the-badge&logo=android&logoColor=white" />
  <img src="https://img.shields.io/badge/Framework-Expo_SDK_50-000020?style=for-the-badge&logo=expo&logoColor=white" />
  <img src="https://img.shields.io/badge/UI-React_Native-61DAFB?style=flat-square&logo=react&logoColor=black" />
  <img src="https://img.shields.io/badge/Backend-GitHub_CMS-181717?style=flat-square&logo=github&logoColor=white" />
</p>

---

## 📌 Table of Contents
- [🌟 Overview](#-overview)
- [🚀 Key Features](#-key-features)
- [📱 Visual Walkthrough](#-visual-walkthrough)
- [🛠️ Technology Stack](#-technology-stack)
- [⚙️ Quick Start](#-quick-start)
- [📂 Architecture](#-architecture)

---

## 🌟 Overview

**VGyan** is a high-performance, mobile-first learning ecosystem designed for aspirants of Indian competitive exams (UPSC, SSC, Banking, Railways). It solves the problem of resource-heavy learning apps by utilizing a **Serverless CMS** model. By leveraging the GitHub API as a backend, the app delivers real-time content updates and secure user data synchronization without the need for an expensive traditional server infrastructure.

The app is built with a focus on **active recall** and **spaced repetition**, ensuring that students master the subjects required for high-stakes examinations through intelligent testing and detailed conceptual reviews.

---

## 🚀 Key Features

| Feature | Description |
| :--- | :--- |
| **⚡ Blitz Mode** | A high-intensity 1-second-per-question challenge designed to sharpen instinctive recall. |
| **🧠 Mastery Hub** | Topic-wise learning modules that offer deep conceptual dives and step-by-step logic. |
| **🔄 Zero-Config Sync** | Securely syncs your progress, bookmarks, and test history across devices using GitHub sharding. |
| **📊 Growth Analytics** | Visualize your performance DNA with subject-wise accuracy and time-management heatmaps. |
| **🏆 Live Arena** | Compete in national-level mock tests and track your global percentile in real-time. |

---

## 📱 Visual Walkthrough

### 🏠 Dashboard & Intelligence
*Your central hub for progress tracking and performance insights.*

<p align="center">
  <img src="assets/screenshots/Home%20page.jpg" width="100" style="border-radius: 15px;" alt="Home" />
  &nbsp;
  <img src="assets/screenshots/Stastics.jpg" width="100" style="border-radius: 15px;" alt="Statistics" />
  &nbsp;
  <img src="assets/screenshots/Leaderboard.jpg" width="100" style="border-radius: 15px;" alt="Leaderboard" />
</p>

- **Smart Sync Engine:** The dashboard features a real-time sync button that monitors the GitHub repository for new exam content, ensuring you always have the latest study material.
- **Performance Heatmaps:** Our analytics engine processes every question you answer to build a subject-wise mastery map, highlighting exactly where you need to focus.

---

### 📝 Strategic Testing & Mock Series
*Simulate real exam conditions with flexible and timed test engines.*

<p align="center">
  <img src="assets/screenshots/test_mode_selection.jpg" width="100" style="border-radius: 15px;" alt="Modes" />
  &nbsp;
  <img src="assets/screenshots/category_selectio_page_for_test_series.jpg" width="100" style="border-radius: 15px;" alt="Categories" />
  &nbsp;
  <img src="assets/screenshots/history_screen_for_attempted_quizes.jpg" width="100" style="border-radius: 15px;" alt="History" />
</p>

- **Dual Testing Engines:** Choose **Practice Mode** for relaxed learning or **Speed Mode** for intense pressure with per-question timers.
- **Dynamic Content:** Exams are pulled directly from the CMS based on your selected category, keeping the app lightweight.
- **Intelligent Review:** Revisit past tests to see detailed solutions, correct answers, and your time spent per question.

---

### 📖 Concept Mastery (Learning Hub)
*Build a strong foundation with structured, explanation-rich exercises.*

<p align="center">
  <img src="assets/screenshots/learning_hub_where%20you_can_learn_different_topics_with_explanation.jpg" width="100" style="border-radius: 15px;" alt="Learning Hub" />
  &nbsp;
  <img src="assets/screenshots/exercise_page_with_topic_wise_questions_with_detail_explanation.jpg" width="100" style="border-radius: 15px;" alt="Exercises" />
</p>

- **Deep-Dive Solutions:** Every exercise question includes a comprehensive explanation and visual diagrams fetched from the remote image server.
- **Topic-Wise Progression:** Master concepts one by one with curated question sets that increase in difficulty as you progress.

---

### ⚡ Competitive Edge (Live Arena)
*Test your metal in scheduled national mocks and the "Blitz" challenge.*

<p align="center">
  <img src="assets/screenshots/live_quiz_discliamer_page.jpg" width="100" style="border-radius: 15px;" alt="Live Test" />
  &nbsp;
  <img src="assets/screenshots/Speed_mode_test_that_have_only_1s_for_each_question.jpg" width="100" style="border-radius: 15px;" alt="Speed Mode" />
  &nbsp;
  <img src="assets/screenshots/Practice_mode_test_with_set_time_for_ebtire_questions.jpg" width="100" style="border-radius: 15px;" alt="Practice Mode" />
</p>

- **The 1s Blitz:** Eliminate hesitation. This mode gives you exactly one second to answer, building the instinctive recall necessary for competitive success.
- **Scheduled Contests:** Join live quizzes at specific times to compete against thousands of other aspirants simultaneously.

---

## 🛠️ Technology Stack

*   **Frontend:** React Native with Expo SDK 50
*   **Navigation:** Expo Router (File-based navigation)
*   **Animations:** React Native Reanimated 3
*   **Backend:** Serverless architecture using GitHub REST API v3
*   **Storage:** Local caching with sharded cloud synchronization via `syncService.js`

---

## ⚙️ Quick Start

1. **Clone & Install**
   ```bash
   git clone https://github.com/your-username/vgyan.git
   cd vgyan && npm install
   ```

2. **Configure .env**
   ```env
   EXPO_PUBLIC_GITHUB_TOKEN=your_token
   EXPO_PUBLIC_GITHUB_USERNAME=your_username
   EXPO_PUBLIC_REPO_NAME=vgyan-content
   EXPO_PUBLIC_USERS_REPO_NAME=vgyan-user-data
   ```

3. **Launch**
   ```bash
   npx expo start
   ```

---

## 📂 Architecture

<details>
<summary><b>📂 Content CMS (GitHub)</b></summary>

```text
├── exam_files/      # Topic-based JSON Mock Tests
├── exercise_files/  # Structured Learning Modules
└── live_test/       # Live Global Contest data
```
</details>

<details>
<summary><b>👤 User Sharding (GitHub)</b></summary>

```text
├── users.json       # Secure User Registry
└── users_data/      # Sharded individual progress (JSON)
```
</details>

---

<p align="center">
  Made with ❤️ by <strong>Prashant Chaurasia</strong>
</p>
