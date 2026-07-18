import React, { useEffect, useState } from 'react';
import { getUILanguage } from '../lib/i18n';



const FeatureMedia: React.FC<{ src: string, altJa: string, altEn: string, t: (ja: string, en: string) => string, narrow?: boolean }> = ({ src, altJa, altEn, t, narrow }) => {
    const [error, setError] = React.useState(false);

    if (error) {
        return (
            <div className="feature-media-block placeholder">
                <p>{t(altJa, altEn)}</p>
                <small>public{src}</small>
            </div>
        );
    }

    return (
        <figure className={`feature-media-block${narrow ? ' media-narrow' : ''}`}>
                <img src={src} alt={t(altJa, altEn)} onError={() => setError(true)} />
        </figure>
    );
};

const Guide: React.FC = () => {
    const [lang, setLang] = useState<'ja' | 'en'>('ja');

    // Detect language on mount
    useEffect(() => {
        const uiLang = getUILanguage();
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
                    <div>
                        <h1>Lumoshot Guide</h1>
                        <p className="guide-kicker">{t('実際のエディタ操作に沿った機能ツアー', 'A feature tour based on the real editor workflow')}</p>
                    </div>
                </div>
                <div className="lang-switch">
                    <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>English</button>
                    <button className={lang === 'ja' ? 'active' : ''} onClick={() => setLang('ja')}>日本語</button>
                </div>
            </header>

            <main className="guide-main">
                <section className="features-list">
                    <div className="release-intro">
                        <div className="intro-copy">
                            <h2>{t('10倍速く、明確に伝える', '10x Faster, Crystal Clear')}</h2>
                            <p>
                                {t(
                                    'Lumoshot は、システムレビューやバグ報告を「もう1往復」減らすための Chrome 拡張機能です。撮る → 描く → 出す の3ステップを最短経路で行えるよう、ポップアップ・上部バー・左サイドバーを順に解説します。',
                                    'Lumoshot is a Chrome extension that removes one round-trip from your system reviews and bug reports. We walk you through the three steps — Capture, Annotate, Export — in the order they appear in the popup, top bar, and left sidebar.'
                                )}
                            </p>
                            <div className="guide-pill-row" aria-label="Guide sections">
                                <span>{t('撮る', 'Capture')}</span>
                                <span>{t('描く', 'Annotate')}</span>
                                <span>{t('隠す', 'Redact')}</span>
                                <span>{t('出す', 'Export')}</span>
                            </div>
                        </div>
                        <div className="intro-brand-mark" aria-hidden="true">
                            <img src="/icons/icon128.png" alt="" />
                        </div>
                    </div>

                    <div className="divider" />

                    {/* ============================================================
                        SECTION 1 — Capture modes (popup entry points)
                       ============================================================ */}
                    <article className="feature-section">
                        <h3>{t('1. キャプチャを開始する', '1. Start a Capture')}</h3>
                        <p>
                            {t(
                                'Web版では、ホーム画面の「画面をキャプチャ」からブラウザの共有ダイアログを開き、別タブ・ウィンドウ・画面を選んで取り込みます。画像ファイルのアップロードやクリップボード貼り付け、サンプルからの開始も同じホーム画面で選べます。',
                                'On the web app, use Capture Screen on the home screen to open the browser picker, then choose another tab, window, or screen. Upload, clipboard paste, and the sample image are also available from the same home screen.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/popup-overview.png" altJa="ホーム画面のスクリーンショット" altEn="Home screen screenshot" t={t} />
                    </article>

                    <div className="feature-divider" />

                    <article className="feature-section">
                        <h3>{t('表示中の画面をキャプチャ', 'Capture the Visible Area')}</h3>
                        <p>
                            {t(
                                'Web版では「画面をキャプチャ」を押すとブラウザの共有ダイアログが開きます。共有対象としてタブ・ウィンドウ・画面を選ぶと、その時点で見えている内容が画像としてエディタに読み込まれます。',
                                'On the web app, Capture Screen opens the browser picker. After you choose a tab, window, or screen, the visible content is captured as an image and loaded into the editor.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/capture-visible.gif" altJa="表示中の画面キャプチャのGIF" altEn="Capture visible GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    <article className="feature-section">
                        <h3>{t('画像をアップロード', 'Upload an Image')}</h3>
                        <p>
                            {t(
                                'すでに手元にある PNG/JPG などの画像は、ホーム画面の「画像をアップロード」から選択してエディタに読み込めます。コピー済みの画像を貼り付けたり、ドラッグ&ドロップで読み込む導線も同じホーム画面から使えます。',
                                'Use Upload an Image on the home screen to choose an existing PNG/JPG and load it into the editor. You can also paste a copied image or drag and drop one from the same home screen.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/capture-local.gif" altJa="画像アップロードのGIF" altEn="Upload image GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    <article className="feature-section">
                        <h3>{t('サンプルで試す', 'Try the Sample')}</h3>
                        <p>
                            {t(
                                '「サンプルで試す」は、画像を用意しなくても編集画面を開ける導線です。すぐにエディタへ移動して、矢印・ぼかし・スポットライト・書き出しなど一通りの操作感を確認できます。',
                                'Try the Sample opens the editor without preparing an image first. It is a quick way to test arrows, blur, spotlight, export, and the rest of the editing flow.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/capture-sample.gif" altJa="サンプルで試すGIF" altEn="Try sample GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    {/* ============================================================
                        SECTION 2 — Top header (frame, zoom, undo/redo, export)
                       ============================================================ */}
                    <article className="feature-section">
                        <h3>{t('2. 編集画面の上部バー', '2. The Editor Top Bar')}</h3>
                        <p>
                            {t(
                                'エディタの上部には、ズーム・フレーム追加・テーマ切替・ヘルプ・元に戻す/やり直す・コピー・保存が並んでいます。最終的な「コピー / 保存」はここから行います。',
                                'The top bar holds zoom, frame toggle, theme switch, help, undo/redo, copy, and save. Final export (Copy or Save) lives here.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/header-overview.png" altJa="上部バー全体のスクリーンショット" altEn="Top bar overview screenshot" t={t} />
                    </article>

                    <div className="feature-divider" />

                    <article className="feature-section">
                        <h3>{t('ズーム', 'Zoom')}</h3>
                        <p>
                            {t(
                                '上部バー左寄りのズームコントロールで、作業中の表示倍率を変更できます。画像そのものの書き出しサイズは変えず、細部を確認したいときだけ拡大・縮小できます。',
                                'Use the zoom controls near the left side of the top bar to change the working view. It does not change the exported image size; it only helps you inspect details while editing.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/header-zoom.gif" altJa="ズーム操作のGIF" altEn="Zoom controls GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    <article className="feature-section">
                        <h3>{t('ホームへ戻る', 'Go Home')}</h3>
                        <p>
                            {t(
                                'ホームアイコンを押すと、編集画面を離れてホーム画面へ戻ります。Web版では編集中の内容が自動保存されるため、あとから最近の編集として開き直せます。',
                                'Click the home icon to leave the editor and return to the home screen. On the web app, the current edit is autosaved so you can reopen it later from recent edits.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/header-home.gif" altJa="ホームへ戻るGIF" altEn="Go home GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    <article className="feature-section">
                        <h3>{t('フレーム追加', 'Add Frame')}</h3>
                        <p>
                            {t(
                                'キャプチャ画像の周りに上品な影とパディングを加えて、SNS や記事に貼り付けやすい仕上がりにします。ボタンで ON / OFF を切り替えられます。',
                                'Wraps the screenshot in a subtle drop shadow and padding so it looks polished in tweets and blog posts. Toggle on or off.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/header-frame.gif" altJa="フレーム追加のGIF" altEn="Add Frame GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    <article className="feature-section">
                        <h3>{t('リサイズ', 'Resize')}</h3>
                        <p>
                            {t(
                                'リサイズでは、編集対象の画像サイズを指定して変更できます。注釈も一緒に拡大・縮小されるため、書き出し前に画像全体のサイズを整えたいときに使います。',
                                'Resize changes the actual image dimensions being edited. Annotations scale with the image, making it useful when you need to prepare the final exported size.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/header-resize.gif" altJa="リサイズのGIF" altEn="Resize GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    <article className="feature-section">
                        <h3>{t('ダークモード', 'Dark Mode')}</h3>
                        <p>
                            {t(
                                '月アイコンでエディタUIをライト/ダークに切り替えられます。画面全体の見やすさを変える機能で、編集している画像や書き出し結果の色は変わりません。',
                                'Use the moon icon to switch the editor UI between light and dark modes. This changes editor visibility only; it does not alter the image or exported result.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/header-dark-mode.gif" altJa="ダークモード切り替えのGIF" altEn="Dark mode toggle GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    <article className="feature-section">
                        <h3>{t('ショートカットとヘルプ', 'Shortcuts and Help')}</h3>
                        <p>
                            {t(
                                'ヘルプアイコンから、ツールの使い方やショートカットを確認できます。慣れてきたら、Vで選択、Rで四角形、Aで矢印など、キーボード中心で素早く操作できます。',
                                'Open help to review tool usage and shortcuts. Once you get familiar, shortcuts like V for Select, R for Rectangle, and A for Arrow make editing much faster.'
                            )}
                        </p>
                    </article>

                    <div className="feature-divider" />

                    <article className="feature-section">
                        <h3>{t('Undo / Redo', 'Undo / Redo')}</h3>
                        <p>
                            {t(
                                '描画ミスはボタン、または ⌘Z / ⌘Y（Windows は Ctrl+Z / Ctrl+Y）で何度でも巻き戻し・やり直しが可能です。',
                                'Undo and redo any drawing mistake with the buttons or ⌘Z / ⌘Y (Ctrl+Z / Ctrl+Y on Windows).'
                            )}
                        </p>
                        <FeatureMedia src="/guide/header-undo-redo.gif" altJa="Undo/RedoのGIF" altEn="Undo / Redo GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    <article className="feature-section">
                        <h3>{t('コピー', 'Copy')}</h3>
                        <p>
                            {t(
                                'コピーを押すと、現在の編集結果をPNG画像としてクリップボードへ送ります。Slack、GitHub、Notion、チャットツールなどへそのまま貼り付けられます。',
                                'Copy sends the current edited result to your clipboard as a PNG image. Paste it directly into Slack, GitHub, Notion, chat tools, and more.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/header-copy.gif" altJa="コピー操作のGIF" altEn="Copy action GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    <article className="feature-section">
                        <h3>{t('PNG保存', 'Save PNG')}</h3>
                        <p>
                            {t(
                                'PNG保存を押すと、現在の編集結果をPNGファイルとしてダウンロードします。共有前にファイルとして残したい場合や、資料へ添付したい場合に使います。',
                                'Save PNG downloads the current edited result as a PNG file. Use it when you want to keep a file or attach the image to a document.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/header-save.gif" altJa="PNG保存操作のGIF" altEn="Save PNG action GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    <article className="feature-section">
                        <h3>{t('画像の縁取り', 'Image Outline')}</h3>
                        <p>
                            {t(
                                '右下の四角アイコンで、キャプチャ画像の外周に細い線を追加できます。フレーム追加のように余白や影を足す機能ではなく、画像の端を内側からなぞるための機能です。白背景の資料やチャットに貼るとき、スクリーンショットの境界をはっきり見せたい場面で使います。',
                                'Use the square icon in the bottom-right controls to add a thin line around the screenshot. Unlike Add Frame, it does not add padding or a shadow; it traces the image edge from the inside. Use it when a screenshot boundary needs to stay visible on white documents or chat surfaces.'
                            )}
                        </p>
                        <p>
                            {t(
                                '使い方: 四角アイコンを押して ON にし、表示されたカラーピッカーで色、スライダーで太さを調整します。縁取りは背景画像のすぐ上、矢印やテキストなどの注釈より下に入るため、注釈を邪魔しません。もう一度四角アイコンを押すと OFF になります。コピーと PNG保存のどちらにも反映されます。',
                                'How to use it: click the square icon to turn it on, then adjust the color with the color picker and the width with the slider. The outline sits directly above the background image and below arrows, text, and other annotations, so it does not cover your markup. Click the square icon again to turn it off. It is included in both Copy and Save PNG.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/header-outline.gif" altJa="画像の縁取りのGIF" altEn="Image outline GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    {/* ============================================================
                        SECTION 3 — Sidebar tools (in actual order)
                       ============================================================ */}
                    <article className="feature-section">
                        <h3>{t('3. 描画ツール（左サイドバー）', '3. Drawing Tools (Left Sidebar)')}</h3>
                        <p>
                            {t(
                                'ここからは左サイドバーに並んだツールを、上から順にすべて解説します。各ツールはカッコ内のキーで直接呼び出せます。',
                                'From here we walk through every tool in the left sidebar, top to bottom. Each tool has a single-key shortcut shown in parentheses.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/sidebar-overview.png" altJa="左サイドバー全体の一覧図" altEn="Left sidebar overview" t={t} narrow />
                    </article>

                    <div className="feature-divider" />

                    <article className="feature-section">
                        <h3>{t('選択', 'Select')} <span className="shortcut-badge">V</span></h3>
                        <p>
                            {t(
                                '描き終わった図形を移動・リサイズ・色変更・整列するための万能ツールです。描画ツールから一度抜けたいときは V を押すだけ。複数選択は ⌘（Ctrl）クリック、または範囲ドラッグで可能です。',
                                'The universal tool for moving, resizing, recoloring, and aligning shapes you have already drawn. Tap V whenever you need to exit a drawing tool. ⌘-click (Ctrl-click) or marquee-drag to multi-select.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/tool-select.gif" altJa="選択ツールのGIF" altEn="Select tool GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    <article className="feature-section">
                        <h3>{t('四角形', 'Rectangle')} <span className="shortcut-badge">R</span></h3>
                        <p>
                            {t(
                                '画面上の特定の領域を囲んで強調するための四角形を描画します。線の太さや色は上部のサブツールバーから変更できます。',
                                'Draw a rectangle to highlight an area. Change stroke width and color from the sub-toolbar at the top.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/tool-rect.gif" altJa="四角形のGIF" altEn="Rectangle GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    <article className="feature-section">
                        <h3>{t('角丸四角形', 'Rounded Rectangle')}</h3>
                        <p>
                            {t(
                                '角が丸い四角形を描画します。モダンな UI 要素や、柔らかい印象を与えたい強調枠に最適です。塗りつぶしの ON/OFF や角の丸みも調整できます。',
                                'A rectangle with rounded corners — ideal for modern UI elements or softer highlights. Toggle fill and adjust corner radius from the sub-toolbar.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/tool-rounded-rect.gif" altJa="角丸四角形のGIF" altEn="Rounded Rectangle GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    <article className="feature-section">
                        <h3>{t('矢印', 'Arrow')} <span className="shortcut-badge">A</span></h3>
                        <p>
                            {t(
                                '矢印ツールには「直線」「曲線」「折れ線」の3モードがあります。直線はドラッグで始点から終点まで引いて確定。曲線と折れ線はクリックでアンカーポイントを追加し、最後にダブルクリックで確定します。',
                                'Arrow has three modes: Straight, Curved, and Elbow. Straight arrows are confirmed by dragging from start to end. Curved and Elbow arrows add anchor points with clicks, then finish with a double-click.'
                            )}
                        </p>
                        <div className="behavior-grid">
                            <div>
                                <strong>{t('直線', 'Straight')}</strong>
                                <span>{t('ドラッグで作成', 'Drag to create')}</span>
                            </div>
                            <div>
                                <strong>{t('曲線', 'Curved')}</strong>
                                <span>{t('クリックで頂点追加 / ダブルクリックで確定', 'Click to add points / double-click to finish')}</span>
                            </div>
                            <div>
                                <strong>{t('折れ線', 'Elbow')}</strong>
                                <span>{t('クリックで曲がり角追加 / ダブルクリックで確定', 'Click to add corners / double-click to finish')}</span>
                            </div>
                        </div>
                        <FeatureMedia src="/guide/tool-arrow.gif" altJa="矢印のGIF" altEn="Arrow GIF" t={t} />
                        <div className="media-pair">
                            <FeatureMedia src="/guide/tool-arrow-curved.gif" altJa="曲線矢印のGIF" altEn="Curved arrow GIF" t={t} />
                            <FeatureMedia src="/guide/tool-arrow-elbow.gif" altJa="折れ線矢印のGIF" altEn="Elbow arrow GIF" t={t} />
                        </div>
                    </article>

                    <div className="feature-divider" />

                    <article className="feature-section">
                        <h3>{t('吹き出し', 'Speech Bubble')} <span className="shortcut-badge">B</span></h3>
                        <p>
                            {t(
                                'しっぽ（Tail）のついた吹き出しを作成します。しっぽの先端にある青いコントロールポイントをドラッグすれば、指し示す先を自由に変更可能。テキスト・線色・背景色も個別に調整できます。',
                                'A text bubble with a customizable tail. Drag the blue control point at the tail tip to point exactly where you want. Text, border, and background colors are all independently adjustable.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/tool-speech-bubble.gif" altJa="吹き出しのGIF" altEn="Speech Bubble GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    <article className="feature-section">
                        <h3>{t('テキスト', 'Text')} <span className="shortcut-badge">T</span></h3>
                        <p>
                            {t(
                                'キャンバス上に直接文字を入力します。フォントサイズ・色・太字・斜体・背景色など、上部サブツールバーから多彩に装飾可能。整列ボタン（左/中央/右、上/中/下）で複数テキストも揃えられます。',
                                'Type directly onto the canvas. Adjust font size, color, bold, italic, and background fill from the sub-toolbar. Use the alignment buttons (left/center/right, top/middle/bottom) to line up multiple text blocks.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/tool-text.gif" altJa="テキストのGIF" altEn="Text GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    <article className="feature-section">
                        <h3>{t('ステップ番号', 'Step Number')} <span className="shortcut-badge">N</span></h3>
                        <p>
                            {t(
                                'クリックするたびに「1, 2, 3...」とカウントアップする番号バッジを置きます。操作手順を伝えるバグ報告やオンボーディング資料で必須の機能です。番号は後からドラッグで並べ替えも可能。',
                                'Drops a numbered badge that counts up (1, 2, 3...) with each click. Indispensable for step-by-step bug reports and onboarding docs. You can rearrange numbers by dragging them afterwards.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/tool-step-number.gif" altJa="ステップ番号のGIF" altEn="Step Number GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    <article className="feature-section">
                        <h3>{t('クリックアイコン', 'Click Icon')} <span className="shortcut-badge">M</span></h3>
                        <p>
                            {t(
                                'マウスカーソルアイコンと集中線（速線）を 1 セットで配置します。「ここを左クリック / 右クリック」という指示が、文字を書かずに 1 ショットで伝わります。サブツールバーから LEFT / RIGHT 切替が可能です。',
                                'Drops a mouse cursor icon with action lines (speed lines). One stamp conveys “click here” without writing a word. Switch between LEFT and RIGHT click from the sub-toolbar.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/tool-click-icon.gif" altJa="クリックアイコンのGIF" altEn="Click Icon GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    <article className="feature-section">
                        <h3>{t('ペン', 'Pen')} <span className="shortcut-badge">P</span></h3>
                        <p>
                            {t(
                                'フリーハンドで自由に線を描画します。描いた線は自動でスムージング処理がかかるので、マウス操作でも綺麗な手書きマークアップが可能です。',
                                'Draw freely with your mouse or trackpad. Strokes are auto-smoothed so even mouse-drawn markup stays clean.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/tool-pen.gif" altJa="ペンのGIF" altEn="Pen GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    <article className="feature-section">
                        <h3>{t('蛍光ペン（マーカー）', 'Highlighter')} <span className="shortcut-badge">H</span></h3>
                        <p>
                            {t(
                                '半透明の太い線を引いて、本にマーカーを引くようにテキストや特定要素を目立たせます。色も透過度も上部から調整可能。',
                                'A thick translucent stroke that highlights text or UI elements just like a real highlighter pen. Color and opacity adjustable from the sub-toolbar.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/tool-highlighter.gif" altJa="マーカーのGIF" altEn="Highlighter GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    <article className="feature-section">
                        <h3>{t('スポットライト（四角）', 'Spotlight (Rectangle)')} <span className="shortcut-badge">S</span></h3>
                        <p>
                            {t(
                                '画面全体を暗く落とし、ドラッグした四角形だけを明るくハイライトします。不要な情報を視覚的に隠しつつ、視線を一点に誘導できる、Lumoshot を象徴する機能です。',
                                'Dims everything and brightly reveals only the rectangle you drag — visually hiding the rest while pulling the eye to one spot. A signature Lumoshot feature.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/tool-spotlight-rect.gif" altJa="スポットライト矩形のGIF" altEn="Spotlight Rect GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    <article className="feature-section">
                        <h3>{t('スポットライト（円）', 'Spotlight (Ellipse)')}</h3>
                        <p>
                            {t(
                                'スポットライトの楕円バージョン。アイコンやアバターなど丸い要素を強調するときに自然な形で囲めます。',
                                'Ellipse version of Spotlight. A natural shape for highlighting round elements like icons or avatars.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/tool-spotlight-ellipse.gif" altJa="スポットライト円形のGIF" altEn="Spotlight Ellipse GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    <article className="feature-section">
                        <h3>{t('ぼかし（モザイク）', 'Blur')} <span className="shortcut-badge">U</span></h3>
                        <p>
                            {t(
                                '指定領域に強いガウスぼかしを掛けます。個人情報・パスワード・社内情報を安全に隠すために必須の機能。ぼかし強度はサブツールバーで調整できます。',
                                'Applies a heavy Gaussian blur to the area you drag. Essential for hiding personal data, passwords, or internal information. Blur strength is adjustable from the sub-toolbar.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/tool-blur.gif" altJa="ぼかしのGIF" altEn="Blur GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    <article className="feature-section">
                        <h3>{t('部分ズーム（四角）', 'Zoom (Rectangle)')}</h3>
                        <p>
                            {t(
                                '画面の一部を拡大し、別の場所にレンズのように表示します。「ここに小さく出ているエラー文言を拡大して見せたい」というときに便利。',
                                'Magnifies a region of the screenshot and shows it elsewhere like a lens. Perfect when a tiny error message needs to be readable in your bug report.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/tool-zoom-rect.gif" altJa="部分ズーム矩形のGIF" altEn="Zoom Rect GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    <article className="feature-section">
                        <h3>{t('部分ズーム（楕円）', 'Zoom (Ellipse)')}</h3>
                        <p>
                            {t(
                                '部分ズームの楕円バージョン。虫眼鏡のような表現で UI の一部を拡大表示できます。',
                                'Ellipse version of Zoom — gives a magnifying-glass look when you want to expand part of the UI.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/tool-zoom-ellipse.gif" altJa="部分ズーム楕円のGIF" altEn="Zoom Ellipse GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    {/* ============================================================
                        SECTION 4 — Image operations
                       ============================================================ */}
                    <article className="feature-section">
                        <h3>{t('4. 画像操作', '4. Image Operations')}</h3>
                        <p>
                            {t(
                                'ここからはキャンバス全体や画像そのものを編集する機能です。サイドバーの最下段にまとまっています。',
                                'These tools operate on the canvas itself or on the underlying image. They sit at the bottom of the sidebar.'
                            )}
                        </p>
                    </article>

                    <div className="feature-divider" />

                    <article className="feature-section">
                        <h3>{t('画像スタンプ（追加）', 'Insert Image (Stamp)')}</h3>
                        <p>
                            {t(
                                'ローカルの PNG / JPG をキャンバスにスタンプのように貼り付けます。アイコン・ロゴ・他のスクショを重ねたいときに便利。位置・大きさは Select ツール（V）で自由に変えられます。',
                                'Stamp a local PNG/JPG onto the canvas — handy for adding icons, logos, or pasting another screenshot. Move and resize with the Select tool (V).'
                            )}
                        </p>
                        <FeatureMedia src="/guide/tool-insert-image.gif" altJa="画像スタンプのGIF" altEn="Insert Image GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    <article className="feature-section">
                        <h3>{t('リサイズ', 'Resize')}</h3>
                        <p>
                            {t(
                                'キャプチャ画像全体の解像度を変更します。「アスペクト比を保つ」を ON のままピクセル数を直接指定できるので、SNS や記事のサイズ規定に合わせて出力したいときに便利。',
                                'Resizes the entire screenshot. Keep aspect ratio on and type a target pixel size — useful when you need to match a blog or social platform’s size requirements.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/tool-resize.gif" altJa="リサイズのGIF" altEn="Resize GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    <article className="feature-section">
                        <h3>{t('クロップ（切り抜き）', 'Crop')} <span className="shortcut-badge">C</span></h3>
                        <p>
                            {t(
                                'キャプチャ画像の余分な部分を切り落とします。ドラッグで範囲を指定して確定ボタンを押すだけ。撮影時に範囲指定し忘れたときの最後の調整に。',
                                'Trim away unwanted parts of the screenshot. Drag to select the keep area and confirm — a useful safety net when you forget to crop while capturing.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/tool-crop.gif" altJa="クロップのGIF" altEn="Crop GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    <article className="feature-section">
                        <h3>{t('Before / After 比較', 'Before / After Comparison')}</h3>
                        <p>
                            {t(
                                '2 枚の画像を並べて、スライダーで「Before / After」を比較するレイアウトを作ります。リデザイン提案や A/B 比較資料の説得力が一気に上がります。',
                                'Drops two images into a side-by-side or slider Before / After layout. Instantly boosts the persuasive power of redesign proposals and A/B comparisons.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/tool-before-after.gif" altJa="Before/AfterのGIF" altEn="Before / After GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    {/* ============================================================
                        SECTION 5 — Context menu / multi-select power features
                       ============================================================ */}
                    <article className="feature-section">
                        <h3>{t('5. 整列・複製・ロック・重ね順', '5. Align, Duplicate, Lock, Stack Order')}</h3>
                        <p>
                            {t(
                                '複数のオブジェクトを Select ツール（V）で選ぶと、上部サブツールバーに「左/中央/右」「上/中央/下」の整列ボタンと、水平/垂直方向の等間隔配置ボタンが現れます。図形を右クリックすれば「複製（⌘D）」「ロック（⌘L）」「最前面/最背面へ移動」「削除」などの便利な操作にもアクセスできます。',
                                'Marquee-select with the Select tool (V) and the sub-toolbar reveals Left / Center / Right and Top / Middle / Bottom alignment, plus horizontal and vertical distribution. Right-click any shape for Duplicate (⌘D), Lock (⌘L), Bring to Front / Send to Back, Delete, and more.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/power-align-duplicate.gif" altJa="整列/複製/ロックのGIF" altEn="Align / Duplicate / Lock GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                </section>

                <div className="divider" />

                <section className="shortcuts-section">
                    <h3>{t('キーボードショートカット一覧', 'Keyboard Shortcuts')}</h3>
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>{t('キー', 'Key')}</th>
                                    <th>{t('動作', 'Action')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr><td colSpan={2} style={{ fontWeight: 600, color: '#94a3b8' }}>{t('— ツール切替 —', '— Tool Switch —')}</td></tr>
                                <tr><td><code>V</code></td><td>{t('選択ツール（移動/リサイズ）', 'Select tool (move/resize)')}</td></tr>
                                <tr><td><code>R</code></td><td>{t('四角形を描画', 'Rectangle')}</td></tr>
                                <tr><td><code>A</code></td><td>{t('矢印を描画', 'Arrow')}</td></tr>
                                <tr><td><code>B</code></td><td>{t('吹き出しを描画', 'Speech Bubble')}</td></tr>
                                <tr><td><code>T</code></td><td>{t('テキストを入力', 'Add Text')}</td></tr>
                                <tr><td><code>N</code></td><td>{t('ステップ番号を配置', 'Step Number')}</td></tr>
                                <tr><td><code>M</code></td><td>{t('クリックアイコン', 'Click Icon')}</td></tr>
                                <tr><td><code>P</code></td><td>{t('ペン（フリーハンド）', 'Pen (freehand)')}</td></tr>
                                <tr><td><code>H</code></td><td>{t('蛍光ペン（マーカー）', 'Highlighter')}</td></tr>
                                <tr><td><code>S</code></td><td>{t('スポットライト（矩形）', 'Spotlight (rectangle)')}</td></tr>
                                <tr><td><code>U</code></td><td>{t('ぼかし（モザイク）', 'Blur')}</td></tr>
                                <tr><td><code>C</code></td><td>{t('切り抜き（クロップ）', 'Crop')}</td></tr>

                                <tr><td colSpan={2} style={{ fontWeight: 600, color: '#94a3b8' }}>{t('— 編集 —', '— Editing —')}</td></tr>
                                <tr><td><code>Delete</code> / <code>Backspace</code></td><td>{t('選択中のオブジェクトを削除', 'Delete selected object')}</td></tr>
                                <tr><td><code>⌘Z</code> / <code>Ctrl+Z</code></td><td>{t('元に戻す（Undo）', 'Undo')}</td></tr>
                                <tr><td><code>⌘Y</code> / <code>Ctrl+Y</code></td><td>{t('やり直す（Redo）', 'Redo')}</td></tr>
                                <tr><td><code>⌘D</code> / <code>Ctrl+D</code></td><td>{t('選択中のオブジェクトを複製', 'Duplicate selected object')}</td></tr>
                                <tr><td><code>⌘L</code> / <code>Ctrl+L</code></td><td>{t('選択中のオブジェクトをロック/解除', 'Lock / unlock selected object')}</td></tr>
                                <tr><td><code>⌘V</code> / <code>Ctrl+V</code></td><td>{t('クリップボードから画像を貼り付け', 'Paste image from clipboard')}</td></tr>
                                <tr><td><code>[</code> / <code>]</code></td><td>{t('重ね順を最背面 / 最前面へ', 'Send to back / Bring to front')}</td></tr>

                                <tr><td colSpan={2} style={{ fontWeight: 600, color: '#94a3b8' }}>{t('— 出力 —', '— Export —')}</td></tr>
                                <tr><td><code>⌘C</code> / <code>Ctrl+C</code></td><td>{t('画像をクリップボードへコピー', 'Copy image to clipboard')}</td></tr>
                                <tr><td><code>⌘S</code> / <code>Ctrl+S</code></td><td>{t('画像をダウンロード（PNG）', 'Download image (PNG)')}</td></tr>
                            </tbody>
                        </table>
                    </div>
                </section>

                <div className="divider" />

                <section className="shortcuts-section">
                    <h3>{t('プロ向け Tips', 'Pro Tips')}</h3>
                    <div className="table-container">
                        <table>
                            <tbody>
                                <tr>
                                    <td>
                                        <strong>{t('① ツール選択はマウスより先にキーボード', '① Reach for the keyboard before the sidebar')}</strong><br />
                                        {t(
                                            '矢印は A、ペンは P、テキストは T。サイドバーまでマウスを動かすより、キー1つでツールを切り替えた方が圧倒的に速いです。',
                                            'Arrow = A, Pen = P, Text = T. Hitting a single key is dramatically faster than moving the mouse all the way to the sidebar.'
                                        )}
                                    </td>
                                </tr>
                                <tr>
                                    <td>
                                        <strong>{t('② 描いた後は V に戻る癖をつける', '② Tap V whenever you finish a stroke')}</strong><br />
                                        {t(
                                            'V（Select）に戻しておけば、誤クリックで余計な図形を描いてしまうのを防げます。「描いたら V」を口癖に。',
                                            'Snapping back to Select (V) prevents accidental extra shapes from stray clicks. Make “draw, then V” a habit.'
                                        )}
                                    </td>
                                </tr>
                                <tr>
                                    <td>
                                        <strong>{t('③ 重なって隠れたら [ ] で並べ替え', '③ Use [ and ] when shapes hide each other')}</strong><br />
                                        {t(
                                            '線が文字の下に隠れてしまった等の場面は、図形を選択して [ で最背面、] で最前面に送ると素早く整理できます。',
                                            'When a stroke hides under text, select it and press [ to send to back or ] to bring to front. Faster than the right-click menu.'
                                        )}
                                    </td>
                                </tr>
                                <tr>
                                    <td>
                                        <strong>{t('④ 個人情報は必ず「ぼかし（U）」で隠す', '④ Always hide personal info with Blur (U)')}</strong><br />
                                        {t(
                                            '黒い四角を上から被せるだけでは、元データを抜かれる事故があり得ます。U キーの「ぼかし」を使えば、元画像のピクセルが破壊されるので安全です。',
                                            'Covering with a black rectangle isn’t enough — the underlying pixels can sometimes be recovered. Press U for the proper Blur, which destroys the underlying pixels.'
                                        )}
                                    </td>
                                </tr>
                                <tr>
                                    <td>
                                        <strong>{t('⑤ クリップボードからの貼り付けで一瞬で起動', '⑤ Paste from clipboard for instant launch')}</strong><br />
                                        {t(
                                            'OS のスクショ（macOS なら ⌘⇧4）を撮ってからポップアップを開き「クリップボードから貼り付け」を選ぶと、その場で即エディタに入れます。',
                                            'Take an OS screenshot (⌘⇧4 on macOS), open the popup, and choose “Paste from Clipboard” to drop straight into the editor.'
                                        )}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </section>
            </main>
        </div>
    );
};

export default Guide;
