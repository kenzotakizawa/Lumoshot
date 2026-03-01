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
                <section className="features-list">
                    {/* Intro / Hero equivalent */}
                    <div className="release-intro">
                        <h2>{t('10倍速く、明確に伝える', '10x Faster, Crystal Clear')}</h2>
                        <p>
                            {t(
                                'Lumoshotは、エンジニアやデザイナーがシステムレビューやバグ報告を行うための強力なスクリーンショット拡張機能です。VS Codeのリリースノートのように、各機能の特徴を見ていきましょう。',
                                'Lumoshot is a powerful screenshot extension for engineers and designers to make system reviews and bug reports. Let\'s explore its features, presented in a familiar release-notes style.'
                            )}
                        </p>
                    </div>

                    <div className="divider" />

                    {/* Spotlight Feature */}
                    <article className="feature-section">
                        <h3>Spotlight <span className="shortcut-badge">L</span></h3>
                        <p>
                            {t(
                                '画面全体を暗く落とし、注目してほしい部分だけを綺麗にハイライトします。ドラッグするだけで不要な情報を隠し、レビューアーの視線を瞬時に誘導できます。複雑なUIの説明に最適です。',
                                'Dims the background and brightly highlights specific areas. Simply drag to hide unnecessary information and instantly guide the reviewer\'s eyes. Perfect for explaining complex UIs.'
                            )}
                        </p>
                        <div className="feature-media-block placeholder">
                            <p>{t('Spotlight GIF', 'Spotlight GIF')}</p>
                            <small>public/guide/spotlight.gif</small>
                        </div>
                    </article>

                    <div className="feature-divider" />

                    {/* Click Icon Feature */}
                    <article className="feature-section">
                        <h3>Click Icon <span className="shortcut-badge">C</span></h3>
                        <p>
                            {t(
                                'マウスカーソルと強調される集中線スタンプをワンクリックで付与。「ここを左（または右）クリックして」という操作指示が、テキストを書かなくても明確に伝わります。上部ツールバーから左右クリックの切り替えも可能です。',
                                'Places a mouse cursor with dynamic action lines in a single click. Instantly conveys "Click Here" without writing any text. Toggle between left and right clicks via the top toolbar.'
                            )}
                        </p>
                        <div className="feature-media-block placeholder">
                            <p>{t('Click Icon GIF', 'Click Icon GIF')}</p>
                            <small>public/guide/click-icon.gif</small>
                        </div>
                    </article>

                    <div className="feature-divider" />

                    {/* Speech Bubble Feature */}
                    <article className="feature-section">
                        <h3>Speech Bubble <span className="shortcut-badge">B</span></h3>
                        <p>
                            {t(
                                'しっぽ（Tail）のついた吹き出し要素を簡単に作成できます。しっぽの先端にある青いコントロールポイントをドラッグすれば、指し示す先を自由かつ正確に変更可能です。',
                                'Easily create text bubbles with customizable tails. Drag the blue control point at the tip to point exactly at the element you are explaining.'
                            )}
                        </p>
                        <div className="feature-media-block placeholder">
                            <p>{t('Speech Bubble GIF', 'Speech Bubble GIF')}</p>
                            <small>public/guide/speech-bubble.gif</small>
                        </div>
                    </article>

                    <div className="feature-divider" />

                    {/* Advanced Editing */}
                    <article className="feature-section">
                        <h3>Re-editable Objects <span className="shortcut-badge">V</span></h3>
                        <p>
                            {t(
                                '描画した図形やテキストは、すべて後から再編集可能です。選択ツールで移動・リサイズ・色変更を行ったり、重なり順（Z-Index）の調整を行うことができます。',
                                'All drawn shapes and text remain fully editable. Use the Select tool to move, resize, change colors, or adjust the Z-Index of any object at any time.'
                            )}
                        </p>
                        <div className="feature-media-block placeholder">
                            <p>{t('Editable Features GIF', 'Editable Features GIF')}</p>
                            <small>public/guide/edit-shapes.gif</small>
                        </div>
                    </article>

                </section>

                <div className="divider" />

                <section className="shortcuts-section">
                    <h3>{t('Pro Keyboard Shortcuts', 'Pro Keyboard Shortcuts')}</h3>
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
