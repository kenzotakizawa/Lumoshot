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
                                'Lumoshotは、エンジニアやデザイナーがシステムレビューやバグ報告を行うための強力なスクリーンショット拡張機能です。サイドバーやトップバーに配置されている順番に沿って、各機能の特徴を見ていきましょう。',
                                'Lumoshot is a powerful screenshot extension for engineers and designers to make system reviews and bug reports. Let\'s explore its features in the order they appear on your toolbars.'
                            )}
                        </p>
                    </div>

                    <div className="divider" />

                    {/* Shapes & Bubble Feature */}
                    <article className="feature-section">
                        <h3>Shapes & Speech Bubble <span className="shortcut-badge">R</span> <span className="shortcut-badge">A</span> <span className="shortcut-badge">B</span></h3>
                        <p>
                            {t(
                                '四角形や丸角四角形、矢印などの基本的な図形に加え、しっぽ（Tail）のついた吹き出し（Speech Bubble）要素を簡単に作成できます。しっぽの先端にある青い丸をドラッグすれば、指し示す先を自由かつ正確に変更可能です。',
                                'Easily draw basic shapes like rectangles and arrows, plus text bubbles with customizable tails. Drag the blue control point at the tip to point exactly at the element you are explaining.'
                            )}
                        </p>
                        <div className="feature-media-block placeholder">
                            <p>{t('Shapes & Speech Bubble GIF', 'Shapes & Speech Bubble GIF')}</p>
                            <small>public/guide/speech-bubble.gif</small>
                        </div>
                    </article>

                    <div className="feature-divider" />

                    {/* Text, Steps & Click Icon */}
                    <article className="feature-section">
                        <h3>Text, Steps & Click Icon <span className="shortcut-badge">T</span> <span className="shortcut-badge">C</span></h3>
                        <p>
                            {t(
                                '通常のテキスト（Text）や連番スタンプ（Step Number）で手順を示せるほか、マウスカーソルと強調される集中線スタンプを付与するClick Icon機能が備わっています。「ここを左（または右）クリックして」という操作指示が、テキストを書かなくても明確に伝わります。上部ツールバーから左右クリックの切り替えも可能です。',
                                'Write text, place numbered steps to show workflows, or use the Click Icon tool to place a mouse cursor with dynamic action lines. Instantly conveys "Click Here" without writing any text. Toggle between left and right clicks via the top toolbar.'
                            )}
                        </p>
                        <div className="feature-media-block placeholder">
                            <p>{t('Click Icon GIF', 'Click Icon GIF')}</p>
                            <small>public/guide/click-icon.gif</small>
                        </div>
                    </article>

                    <div className="feature-divider" />

                    {/* Pen & Highlighter */}
                    <article className="feature-section">
                        <h3>Pen & Highlighter <span className="shortcut-badge">P</span></h3>
                        <p>
                            {t(
                                'フリーハンドのペン（Pen）や、半透明のマーカー（Highlighter）機能で、気になった箇所を直感的にマークアップできます。描画した線は滑らかに補正され、見やすい仕上がりになります。',
                                'Freehand drawing with the Pen tool or translucent marking with the Highlighter tool lets you intuitively mark up areas of interest. Drawn lines are smoothed for a clean look.'
                            )}
                        </p>
                        <div className="feature-media-block placeholder">
                            <p>{t('Pen & Highlighter GIF', 'Pen & Highlighter GIF')}</p>
                            <small>public/guide/draw-tools.gif</small>
                        </div>
                    </article>

                    <div className="feature-divider" />

                    {/* Spotlight & Blur Feature */}
                    <article className="feature-section">
                        <h3>Spotlight & Blur <span className="shortcut-badge">L</span></h3>
                        <p>
                            {t(
                                '画面全体を暗く落とし、注目してほしい部分だけを綺麗にハイライトするスポットライト（Spotlight）機能です。四角形と楕円形の2種類が用意されており、ドラッグするだけで不要な情報を隠し、レビューアーの視線を瞬時に誘導できます。個人情報を隠すためのモザイク/ぼかし（Blur）機能も搭載しています。',
                                'The Spotlight tool dims the background and brightly highlights specific areas (rectangular or elliptical). Simply drag to hide unnecessary information and instantly guide the reviewer\'s eyes. A Blur tool is also included to hide personal information.'
                            )}
                        </p>
                        <div className="feature-media-block placeholder">
                            <p>{t('Spotlight & Blur GIF', 'Spotlight & Blur GIF')}</p>
                            <small>public/guide/spotlight.gif</small>
                        </div>
                    </article>

                    <div className="feature-divider" />

                    {/* Media Setup & Canvas Layout */}
                    <article className="feature-section">
                        <h3>Media Setup & Canvas Layout</h3>
                        <p>
                            {t(
                                '画面キャプチャだけでなく、ローカル画像（Insert Image）を追加したり、Webカメラ（Webcam）からの映像を配置して、顔を出しながらの説明画像を作成できます。全体を見渡して不要な余白を削るクロップ（Crop）や、キャンバスのピクセルサイズ自体を変更するリサイズ（Resize）機能もサイドバー下部に揃っています。',
                                'Beyond screenshots, you can insert local images or place a webcam feed to create explanations with your face. Tools to crop to remove margins or resize the canvas pixel dimensions are also available at the bottom of the sidebar.'
                            )}
                        </p>
                        <div className="feature-media-block placeholder">
                            <p>{t('Media Setup GIF', 'Media Setup GIF')}</p>
                            <small>public/guide/media-setup.gif</small>
                        </div>
                    </article>

                    <div className="feature-divider" />

                    {/* Advanced Editing (Select Mode) */}
                    <article className="feature-section">
                        <h3>Re-editable Objects <span className="shortcut-badge">V</span></h3>
                        <p>
                            {t(
                                '描画した図形やテキストはすべてオブジェクトとして保持されているため、後から再編集可能です。選択ツールで移動・リサイズ・色変更を行ったり、重なり順（Z-Index）の調整を行うことができます。',
                                'All drawn shapes and text are kept as objects and remain fully editable. Use the Select tool to move, resize, change colors, or adjust the Z-Index of any object at any time.'
                            )}
                        </p>
                        <div className="feature-media-block placeholder">
                            <p>{t('Editable Features GIF', 'Editable Features GIF')}</p>
                            <small>public/guide/edit-shapes.gif</small>
                        </div>
                    </article>

                    <div className="feature-divider" />

                    {/* Export capabilities */}
                    <article className="feature-section">
                        <h3>Export & Copy <span className="shortcut-badge">Cmd/Ctrl+C</span></h3>
                        <p>
                            {t(
                                'ヘッダーに配置されたコピーボタンやダウンロードボタンを活用し、完成した画像をワンクリップでクリップボードへ保存。そのままSlackやNotion、GitHubにペーストできます。',
                                'Use the copy or download buttons on the header to instantly save the finished image to your clipboard. Paste it directly into Slack, GitHub, or Notion.'
                            )}
                        </p>
                        <div className="feature-media-block placeholder">
                            <p>{t('Export GIF', 'Export GIF')}</p>
                            <small>public/guide/export.gif</small>
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
