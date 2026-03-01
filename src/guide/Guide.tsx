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
                    <h2>{t('✨ 主な機能一覧', '✨ Key Features')}</h2>
                    <div className="features-grid">
                        {/* Spotlight Feature */}
                        <div className="feature-grid-card">
                            <div className="feature-grid-media placeholder">
                                <p>{t('Spotlight GIF', 'Spotlight GIF')}</p>
                                <small>public/guide/spotlight.gif</small>
                            </div>
                            <div className="feature-grid-content">
                                <h3>Spotlight <span className="shortcut-badge">L</span></h3>
                                <p>
                                    {t(
                                        '画面全体を暗く落とし、注目してほしい部分だけを綺麗にハイライト。不要な情報を隠し視線を誘導できます。',
                                        'Dims the background and brightly highlights specific areas. Perfect for guiding the viewer\'s eyes.'
                                    )}
                                </p>
                            </div>
                        </div>

                        {/* Click Icon Feature */}
                        <div className="feature-grid-card">
                            <div className="feature-grid-media placeholder">
                                <p>{t('Click Icon GIF', 'Click Icon GIF')}</p>
                                <small>public/guide/click-icon.gif</small>
                            </div>
                            <div className="feature-grid-content">
                                <h3>Click Icon <span className="shortcut-badge">C</span></h3>
                                <p>
                                    {t(
                                        'マウスカーソルと集中線スタンプを付与。「ここを左/右クリックして」という指示が一目で伝わります。',
                                        'Places a mouse cursor with action lines. Instantly conveys "Click Here" without writing text.'
                                    )}
                                </p>
                            </div>
                        </div>

                        {/* Speech Bubble Feature */}
                        <div className="feature-grid-card">
                            <div className="feature-grid-media placeholder">
                                <p>{t('Speech Bubble GIF', 'Speech Bubble GIF')}</p>
                                <small>public/guide/speech-bubble.gif</small>
                            </div>
                            <div className="feature-grid-content">
                                <h3>Speech Bubble <span className="shortcut-badge">B</span></h3>
                                <p>
                                    {t(
                                        'しっぽのついた吹き出しを作れます。コントロールポイントをドラッグして、指し示す先を自由に変更可能。',
                                        'A text bubble with a customizable tail. Drag the control point to point exactly at what you are explaining.'
                                    )}
                                </p>
                            </div>
                        </div>

                        {/* Arrow & Pen */}
                        <div className="feature-grid-card">
                            <div className="feature-grid-media placeholder">
                                <p>{t('Arrow & Pen GIF', 'Arrow & Pen GIF')}</p>
                                <small>public/guide/draw-tools.gif</small>
                            </div>
                            <div className="feature-grid-content">
                                <h3>Arrow & Pen <span className="shortcut-badge">A</span> <span className="shortcut-badge">P</span></h3>
                                <p>
                                    {t(
                                        '美しい矢印と滑らかなフリーハンドペン。線幅や色、透明度もプロパティバーから素早く変更できます。',
                                        'Beautiful arrows and smooth freehand drawing. Quickly change stroke width and colors from the property bar.'
                                    )}
                                </p>
                            </div>
                        </div>

                        {/* Re-editable Shapes */}
                        <div className="feature-grid-card">
                            <div className="feature-grid-media placeholder">
                                <p>{t('Editable GIF', 'Editable GIF')}</p>
                                <small>public/guide/edit-shapes.gif</small>
                            </div>
                            <div className="feature-grid-content">
                                <h3>Re-editable <span className="shortcut-badge">V</span></h3>
                                <p>
                                    {t(
                                        '描いた図形は後から何度でも移動・リサイズ・色変更が可能。Z-Index（重なり順）の変更にも対応。',
                                        'All drawn objects remain editable! Use the Select tool to move, resize, change colors, or adjust Z-Index.'
                                    )}
                                </p>
                            </div>
                        </div>

                        {/* High-quality Export */}
                        <div className="feature-grid-card">
                            <div className="feature-grid-media placeholder">
                                <p>{t('Export GIF', 'Export GIF')}</p>
                                <small>public/guide/export.gif</small>
                            </div>
                            <div className="feature-grid-content">
                                <h3>Quick Export <span className="shortcut-badge">Cmd+C</span></h3>
                                <p>
                                    {t(
                                        '完成した画像はワンクリップでクリップボードへ。そのままSlackやNotion、GitHubにペーストできます。',
                                        'Instantly copy the finished image to your clipboard and paste it directly into Slack, GitHub, or Notion.'
                                    )}
                                </p>
                            </div>
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
