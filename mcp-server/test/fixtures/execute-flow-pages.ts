export const LOGIN_PAGE = `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="utf-8"><title>Login</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 32px; background: #f5f5f5; }
  form { background: white; padding: 24px; border-radius: 8px; width: 360px; }
  h1 { margin: 0 0 20px; font-size: 20px; }
  label { display: block; font-size: 13px; color: #555; margin-bottom: 4px; }
  input { display: block; width: 100%; padding: 8px 12px; box-sizing: border-box;
          border: 1px solid #ccc; border-radius: 4px; margin-bottom: 16px; font-size: 14px; }
  button { width: 100%; padding: 10px; background: #3182CE; color: white;
           border: none; border-radius: 4px; font-size: 15px; cursor: pointer; }
  button:hover { background: #2b6cb0; }
</style></head>
<body>
  <form method="post" action="/success" id="loginForm">
    <h1>ログイン</h1>
    <label for="email">メールアドレス</label>
    <input id="email" type="email" name="email" placeholder="user@example.com" />
    <label for="password">パスワード</label>
    <input id="password" type="password" name="password" placeholder="••••••••" />
    <button type="submit" id="loginBtn">ログイン</button>
  </form>
</body>
</html>`;

export const SUCCESS_PAGE = `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="utf-8"><title>Dashboard</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 32px; background: #f0f7ff; }
  .card { background: white; padding: 24px; border-radius: 8px; width: 400px; }
  h1 { margin: 0 0 20px; font-size: 20px; color: #2b6cb0; }
  p { color: #444; }
  .settings-btn { padding: 8px 16px; background: #38A169; color: white;
                  border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
</style></head>
<body>
  <div class="card">
    <h1>ログイン成功</h1>
    <p>ダッシュボードへようこそ。</p>
    <button class="settings-btn" id="settingsBtn">設定を開く</button>
  </div>
</body>
</html>`;

export const SETTINGS_PAGE = `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="utf-8"><title>Settings</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 32px; }
  .card { background: white; padding: 24px; border-radius: 8px; width: 400px;
          box-shadow: 0 1px 4px rgba(0,0,0,.12); }
  h1 { margin: 0 0 20px; font-size: 18px; }
  label { display: block; font-size: 13px; color: #555; margin-bottom: 4px; }
  input[type=text] { display: block; width: 100%; padding: 7px 10px; box-sizing: border-box;
                     border: 1px solid #ccc; border-radius: 4px; margin-bottom: 14px; }
  select { display: block; width: 100%; padding: 7px; margin-bottom: 14px;
           border: 1px solid #ccc; border-radius: 4px; }
  .save-btn { padding: 9px 20px; background: #3182CE; color: white;
              border: none; border-radius: 4px; cursor: pointer; }
</style></head>
<body>
  <div class="card">
    <h1>プロフィール設定</h1>
    <label for="displayName">表示名</label>
    <input id="displayName" type="text" value="" placeholder="名前を入力" />
    <label for="lang">言語</label>
    <select id="lang">
      <option value="ja">日本語</option>
      <option value="en">English</option>
    </select>
    <button class="save-btn" id="saveBtn">保存する</button>
  </div>
</body>
</html>`;

