import React, { useEffect, useState } from 'react';

const Guide: React.FC = () => {
    const [lang, setLang] = useState<'ja' | 'en'>('ja');

    // Detect language on mount
    useEffect(() => {
        const uiLang = chrome.i18n.getUILanguage();
        if (uiLang.startsWith('ja')) {
            setLang('ja');
        } else {
            setLang('en');
        }
    }, []);

    const t = (ja: string, en: string) => lang === 'ja' ? ja : en;

    return (
        <div className="guide-container">
            <header className="guide-header">
                <div className="header-content">
                    <img src="/icons/icon48.png" alt="Lumoshot Logo" className="logo" />
                    <h1>Lumoshot Guide</h1>
                </div>
                <div className="lang-switch">
                    <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>English</button>
                    <button className={lang === 'ja' ? 'active' : ''} onClick={() => setLang('ja')}>日本語</button>
                </div>
            </header>

            <main className="guide-main">
                <section className="intro">
                    <h2>{t('爆速で伝わるスクリーンショット作成ツール', 'Lightning-fast screenshot annotation tool')}</h2>
                    <p>
                        {t(
                            'Lumoshotは、エンジニアやデザイナーが、システムレビューやバグ報告を10倍速く・分かりやすく伝えるために作られたChrome拡張キャプチャツールです。',
                            'Lumoshot is a Chrome Extension designed to make system reviews, bug reports, and UX feedback 10x faster and clearer.'
                        )}
                    </p>
                </section>

                <div className="divider" />

                <section className="features">
                    <h2>{t('✨ 必修機能ベスト3', '✨ Top 3 Unique Features')}</h2>

                    {/* Spotlight Feature */}
                    <div className="feature-card">
                        <div className="feature-text">
                            <h3>1. Spotlight <span className="shortcut-badge">L</span></h3>
                            <p>
                                {t(
                                    '画面全体を暗く落とし、注目してほしい部分だけを明るく見せる機能。ドラッグするだけで、不要な情報を隠し視線を誘導できます。',
                                    'Dims the entire background and brightly highlights only the specific area you draw. Perfect for guiding the viewer\'s eyes directly to the important part of the UI.'
                                )}
                            </p>
                        </div>
                        <div className="feature-media placeholder">
                            <p>{t('ここに Spotlight の操作GIF画像を配置', 'Place Spotlight usage GIF here')}</p>
                            <small>public/guide/spotlight.gif</small>
                        </div>
                    </div>

                    {/* Click Icon Feature */}
                    <div className="feature-card reverse">
                        <div className="feature-text">
                            <h3>2. Click Icon <span className="shortcut-badge">C</span></h3>
                            <p>
                                {t(
                                    'マウスカーソルのアイコンと集中線スタンプを付与します。「ここを左クリックして」「ここを右クリックして」という操作指示が、文字なしで明確に伝わります。',
                                    'Places a mouse cursor icon with dynamic action lines. Instantly conveys "Click Here" without needing to write text. Toggle Left/Right click via the top bar.'
                                )}
                            </p>
                        </div>
                        <div className="feature-media placeholder">
                            <p>{t('ここに Click Icon の操作GIF画像を配置', 'Place Click Icon usage GIF here')}</p>
                            <small>public/guide/click-icon.gif</small>
                        </div>
                    </div>

                    {/* Speech Bubble Feature */}
                    <div className="feature-card">
                        <div className="feature-text">
                            <h3>3. Speech Bubble <span className="shortcut-badge">B</span></h3>
                            <p>
                                {t(
                                    'しっぽ（Tail）のついた吹き出しを作れます。しっぽの先端にある青い丸をドラッグすれば、指し示す先を自由に変更可能です。',
                                    'A text bubble with a customizable tail. Drag the blue control point at the tip of the tail to point exactly at what you are explaining.'
                                )}
                            </p>
                        </div>
                        <div className="feature-media placeholder">
                            <p>{t('ここに Speech Bubble の操作GIF画像を配置', 'Place Speech Bubble usage GIF here')}</p>
                            <small>public/guide/speech-bubble.gif</small>
                        </div>
                    </div>
                </section>

                <div className="divider" />

                <section className="shortcuts">
                    <h2>{t('💡 プロ向け ショートカット一覧', '💡 Pro Keyboard Shortcuts')}</h2>
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>{t('キー', 'Key')}</th>
                                    <th>{t('動作', 'Action')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr><td><code>V</code></td><td>{t('選択ツール（移動/リサイズ）', 'Select Tool (Move/Resize)')}</td></tr>
                                <tr><td><code>A</code></td><td>{t('矢印を描く', 'Draw Arrow')}</td></tr>
                                <tr><td><code>P</code></td><td>{t('ペンツールを描く', 'Draw Pen')}</td></tr>
                                <tr><td><code>T</code></td><td>{t('文字を入力する', 'Add Text')}</td></tr>
                                <tr><td><code>L</code></td><td>{t('スポットライト', 'Spotlight')}</td></tr>
                                <tr><td><code>C</code></td><td>{t('クリックアイコン', 'Click Icon')}</td></tr>
                                <tr><td><code>B</code></td><td>{t('吹き出し', 'Speech Bubble')}</td></tr>
                                <tr><td><code>R</code></td><td>{t('四角形', 'Rectangle')}</td></tr>
                                <tr><td><code>Delete / Backspace</code></td><td>{t('選択した図形を削除', 'Delete selected object')}</td></tr>
                                <tr><td><code>Cmd/Ctrl + C</code></td><td>{t('画像をクリップボードにコピー', 'Copy image to clipboard')}</td></tr>
                                <tr><td><code>Cmd/Ctrl + S</code></td><td>{t('画像をダウンロード保存', 'Download image')}</td></tr>
                                <tr><td><code>[ / ]</code></td><td>{t('重ね順（最前面/最背面）の変更', 'Bring Forward / Send to Back')}</td></tr>
                            </tbody>
                        </table>
                    </div>
                </section>
            </main>
        </div>
    );
};

export default Guide;
