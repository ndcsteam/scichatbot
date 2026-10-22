# SciChatbot

學校用的網上聊天機械人平台。前端是 React，部署到 GitHub Pages；帳號、資料與 Poe 呼叫放在 Firebase。學生和老師只用學校 Google 帳號登入。

## 角色

- 管理員：查看已登入帳號、指派角色、停用帳號、刪除待指派帳號和學生，以及停用或刪除任何聊天機械人。
- 老師：建立機械人，選擇 AI 模型、設定系統提示詞、歡迎詞與參考資料，邀請學生，閱讀每位學生的對話，以及刪除自己的聊天機械人。
- 學生：只與獲邀的機械人各自對話。

首次登入的帳號預設是「待指派」，直到管理員指定角色。任何管理員都可以在帳號頁改為：之後第一次登入的新帳號自動成為學生。`BOOTSTRAP_ADMIN_EMAILS` 裡的學校電郵會在首次登入時直接成為管理員。

## 事前準備

1. 建立 Firebase 專案，並升級到 **Blaze** 方案。Cloud Functions 需要對外呼叫 Poe。
2. 建立 Firestore 與 Cloud Storage 時，地區選 **asia-east1（台灣）**。Functions 也部署在這個地區；Storage 觸發程序必須和 bucket 同一個地區。
3. 在 Authentication 啟用 **Google** 提供者。
4. 在 Authentication 的授權網域加入 `localhost`，以及日後的 GitHub Pages 網域（例如 `你的帳號.github.io`）。
5. 啟用 Authentication 的 blocking functions（Identity Platform）。`guardSchoolDomain` 會拒絕學校網域以外的新帳號。
6. 到 [Poe API keys](https://poe.com/api/keys) 建立金鑰。金鑰只放在 Cloud Functions，不會進入前端。

安裝工具：

```bash
npm install -g firebase-tools
firebase login
```

把專案指向你的 Firebase 專案：

```bash
firebase use --add
```

## 設定

複製範例後填上真實值。這些檔案不會被 git 追蹤。

```bash
cp frontend/.env.example frontend/.env
cp functions/.env.example functions/.env
```

`frontend/.env`：

- `VITE_FIREBASE_*`：Firebase 主控台「專案設定」裡的網頁應用程式設定。
- `VITE_ALLOWED_GOOGLE_DOMAIN`：學校網域，例如 `school.edu.hk`。不要加 `@`。

`functions/.env`：

- `ALLOWED_GOOGLE_DOMAIN`：與前端同一個網域。
- `BOOTSTRAP_ADMIN_EMAILS`：首位管理員的學校 Google 電郵。多於一個時用逗號分隔。

Poe 金鑰：

```bash
firebase functions:secrets:set POE_API_KEY
```

本機模擬器若要讀取這把金鑰，可另外建立 `functions/.secret.local`：

```bash
POE_API_KEY=你的金鑰
```

## 部署後端

```bash
cd functions
npm install
npm test
npm run build
cd ..
firebase deploy --only functions,firestore,storage
```

Storage 規則會讀取 Firestore 來確認機械人的老師。第一次部署時，Firebase CLI 會問是否授權，請選「是」。在非互動環境（例如 CI）部署時，CLI 會略過這一步，上傳參考資料就會一律顯示沒有權限。這時要手動把 `roles/firebaserules.firestoreServiceAgent` 授予 `service-專案編號@gcp-sa-firebasestorage.iam.gserviceaccount.com`。

部署完成後，用首位管理員的學校 Google 帳號開啟網站並登入。該帳號會成為管理員，之後可在「帳號」頁把其他人設為老師或學生。

修改學校網域或管理員電郵後，要重新部署 Functions 才會生效。

## 本機前端

```bash
cd frontend
npm install
npm run dev
```

開啟終端顯示的本機網址，使用學校 Google 帳號登入。

## 部署 GitHub Pages

1. 把這個專案推上 GitHub，並在倉庫 Settings → Pages 選 **GitHub Actions**。
2. 在倉庫 Secrets 加入與 `frontend/.env` 相同的變數：
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
   - `VITE_ALLOWED_GOOGLE_DOMAIN`
3. 推上 `main` 後，工作流程會以 `/倉庫名稱/` 為基底路徑建置並發布。
4. 把發布後的網域加入 Firebase 授權網域。

Firebase 的網頁 API key 可以放在前端。它不是 Poe 金鑰。權限由 Firestore／Storage 規則與 custom claims 控制。

## 使用方式

1. 管理員登入後，等老師和學生各登入一次，再把角色設成老師或學生。
2. 老師按「建立」進入設定頁，填寫機械人名稱、系統提示詞和歡迎詞，選擇 AI 模型（預設 Gemini 3.8 Flash），並在同一頁上傳參考資料。Google 只提供 Gemini 3.8 Flash；其他供應商各提供一個價錢相近、可以讀圖的模型。
3. 參考資料接受 `.txt`、`.md` 或 `.pdf`，每個檔案小於 32MB。有上傳時，回答會使用這些資料；沒有上傳就不會。系統會把文件切成約 1000 字的片段，學生發問時用關鍵詞找出相關段落，再交給 Poe。
4. 老師以學生的學校電郵邀請。對方必須已經登入過，而且角色已是學生。
5. 學生只會看到自己獲邀的機械人。每位學生的對話各自獨立。
6. 老師可閱讀全部學生紀錄。移除學生後，對方不能再發言，既有紀錄仍保留。

歡迎詞只在學生還沒有任何訊息時顯示，不會送給模型。
