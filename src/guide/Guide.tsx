import React, { useEffect, useState } from 'react';



const FeatureMedia: React.FC<{ src: string, altJa: string, altEn: string, t: (ja: string, en: string) => string }> = ({ src, altJa, altEn, t }) => {
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
        <React.Fragment>
            <div className="feature-media-block">
                <img src={src} alt={t(altJa, altEn)} onError={() => setError(true)} />
            </div>
        </React.Fragment>
    );
};

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
                    <div className="release-intro">
                        <h2>{t('10倍速く、明確に伝える', '10x Faster, Crystal Clear')}</h2>
                        <p>
                            {t(
                                'Lumoshotは、システムレビューやバグ報告を行うための強力なスクリーンショット拡張機能です。サイドバーやトップバーに配置されている順番に沿って、全機能を1つずつご紹介します。',
                                'Lumoshot is a powerful screenshot extension for system reviews and bug reports. Let\'s explore every feature one by one.'
                            )}
                        </p>
                    </div>

                    <div className="divider" />

                    {/* 1. 選択ツール */}
                    <article className="feature-section">
                        <h3>{t('選択ツール', 'Select Tool')} <span className="shortcut-badge">V</span></h3>
                        <p>
                            {t(
                                '描画した図形やテキストを選択します。後から何度でも移動・リサイズ・色変更が可能なほか、重なり順（最前面/最背面など）の調整が行えます。',
                                'Select drawn objects to move, resize, change colors, or adjust their Z-Index.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/tool-select.gif" altJa="選択ツールのGIF" altEn="Select Tool GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    {/* 2. 四角形 */}
                    <article className="feature-section">
                        <h3>{t('四角形', 'Rectangle')} <span className="shortcut-badge">R</span></h3>
                        <p>
                            {t(
                                '画面上の特定の領域を囲んで強調するための四角形を描画します。線の太さや色は上部ツールバーから簡単に変更できます。',
                                'Draw a rectangle to highlight specific areas on the screen. Change stroke width and color from the top toolbar.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/tool-rect.gif" altJa="四角形のGIF" altEn="Rectangle GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    {/* 3. 角丸四角形 */}
                    <article className="feature-section">
                        <h3>{t('角丸四角形', 'Rounded Rectangle')}</h3>
                        <p>
                            {t(
                                '角が丸い四角形を描画します。モダンなUI要素を囲む際や、柔らかい印象を与えたい場合に最適です。',
                                'Draw a rectangle with rounded corners, perfect for highlighting modern UI elements with a softer look.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/tool-rounded-rect.gif" altJa="角丸四角形のGIF" altEn="Rounded Rectangle GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    {/* 4. 矢印 */}
                    <article className="feature-section">
                        <h3>{t('矢印', 'Arrow')} <span className="shortcut-badge">A</span></h3>
                        <p>
                            {t(
                                '視線を誘導するための美しい矢印を描画します。始点から終点に向かってドラッグするだけで直感的に配置できます。',
                                'Draw a beautiful arrow to guide the viewer\'s eyes. Simply drag from the start point to the end point.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/tool-arrow.gif" altJa="矢印のGIF" altEn="Arrow GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    {/* 5. 吹き出し */}
                    <article className="feature-section">
                        <h3>{t('吹き出し', 'Speech Bubble')} <span className="shortcut-badge">B</span></h3>
                        <p>
                            {t(
                                'しっぽ（Tail）のついた吹き出し要素を作成します。しっぽの先端にある青いコントロールポイントをドラッグして、指し示す先を自由に変更できます。',
                                'Create a text bubble with a customizable tail. Drag the blue control point to point exactly at what you are explaining.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/tool-speech-bubble.gif" altJa="吹き出しのGIF" altEn="Speech Bubble GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    {/* 6. テキスト */}
                    <article className="feature-section">
                        <h3>{t('テキスト', 'Text')} <span className="shortcut-badge">T</span></h3>
                        <p>
                            {t(
                                'キャンバス上に直接文字を入力します。フォントサイズ、色、太字、斜体、背景色など、上部ツールバーから多彩な装飾が可能です。',
                                'Type text directly onto the canvas. Adjust font size, color, bold, italic, and background color from the top toolbar.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/tool-text.gif" altJa="テキストのGIF" altEn="Text GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    {/* 7. ステップ番号 */}
                    <article className="feature-section">
                        <h3>{t('ステップ番号', 'Step Number')}</h3>
                        <p>
                            {t(
                                'クリックするたびに「1, 2, 3...」とカウントアップする番号スタンプを配置します。操作手順やワークフローを説明する際に非常に便利です。',
                                'Place a numbered stamp that counts up with each click (1, 2, 3...). Extremely useful for explaining workflows and steps.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/tool-step-number.gif" altJa="ステップ番号のGIF" altEn="Step Number GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    {/* 8. クリックアイコン */}
                    <article className="feature-section">
                        <h3>{t('クリックアイコン', 'Click Icon')} <span className="shortcut-badge">C</span></h3>
                        <p>
                            {t(
                                'マウスカーソルと強調される集中線スタンプを付与します。「ここを左（右）クリック」という指示がテキスト無しで明確に伝わります。',
                                'Places a mouse cursor with dynamic action lines. Instantly conveys "Click Here" without writing any text.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/tool-click-icon.gif" altJa="クリックアイコンのGIF" altEn="Click Icon GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    {/* 9. ペン */}
                    <article className="feature-section">
                        <h3>{t('ペン', 'Pen')} <span className="shortcut-badge">P</span></h3>
                        <p>
                            {t(
                                'フリーハンドで自由に線を描画します。描いた線は自動で滑らかに補正されるため、マウス操作でも綺麗なマークアップが可能です。',
                                'Draw freely with your mouse. The drawn lines are automatically smoothed for a clean markup experience.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/tool-pen.gif" altJa="ペンのGIF" altEn="Pen GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    {/* 10. マーカー */}
                    <article className="feature-section">
                        <h3>{t('マーカー', 'Highlighter')}</h3>
                        <p>
                            {t(
                                '半透明の太い線を描画します。テキストや特定の要素を、本にマーカーを引くような感覚で目立たせることができます。',
                                'Draw thick, translucent lines. Perfect for highlighting text or specific elements just like a real highlighter pen.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/tool-highlighter.gif" altJa="マーカーのGIF" altEn="Highlighter GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    {/* 11. スポットライト（四角形・楕円） */}
                    <article className="feature-section">
                        <h3>{t('スポットライト', 'Spotlight')} <span className="shortcut-badge">L</span></h3>
                        <p>
                            {t(
                                '画面全体を暗く落とし、ドラッグした部分（四角形または楕円形）だけを明るくハイライトします。不要な情報を隠し、視線を瞬時に誘導できます。',
                                'Dims the whole screen and brightly highlights only the drawn area (rectangle or ellipse) to instantly guide the reviewer\'s eyes.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/tool-spotlight.gif" altJa="スポットライトのGIF" altEn="Spotlight GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    {/* 12. ぼかし / モザイク */}
                    <article className="feature-section">
                        <h3>{t('モザイク / ぼかし', 'Blur')}</h3>
                        <p>
                            {t(
                                '指定した領域に強力なぼかし処理（モザイク）をかけます。個人情報やパスワード、公開できない機密情報を安全に隠すために必須の機能です。',
                                'Applies a strong blur effect to the specified area. Essential for safely hiding personal information, passwords, or confidential data.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/tool-blur.gif" altJa="ぼかしのGIF" altEn="Blur GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    {/* 13. 画像挿入 */}
                    <article className="feature-section">
                        <h3>{t('画像挿入', 'Insert Image')}</h3>
                        <p>
                            {t(
                                'ローカルにある別の画像ファイルをキャンバス上に追加で配置します。参考画像やロゴなどを貼り合わせたい時に使用します。',
                                'Insert another local image file onto the canvas. Useful for adding reference images or logos to your screenshot.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/tool-insert-image.gif" altJa="画像挿入のGIF" altEn="Insert Image GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    {/* 14. Webカメラ */}
                    <article className="feature-section">
                        <h3>{t('Webカメラ', 'Webcam')}</h3>
                        <p>
                            {t(
                                'Webカメラの映像を丸く切り抜いてキャンバスに配置します。顔を出して親しみやすい説明画像（ピクチャーインピクチャー風）を作ることができます。',
                                'Place a circular cutout of your webcam feed onto the canvas. Create engaging, picture-in-picture style explanations with your face.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/tool-webcam.gif" altJa="WebカメラのGIF" altEn="Webcam GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    {/* 15. リサイズ */}
                    <article className="feature-section">
                        <h3>{t('リサイズ', 'Resize')}</h3>
                        <p>
                            {t(
                                'キャンバス（画像）のピクセル寸法自体を変更します。特定の横幅や縦幅のフォーマットに合わせた画像を出力したい場合に便利です。',
                                'Change the pixel dimensions of the canvas (image). Useful when you need to output an image tailored to specific width or height requirements.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/tool-resize.gif" altJa="リサイズのGIF" altEn="Resize GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    {/* 16. クロップ */}
                    <article className="feature-section">
                        <h3>{t('クロップ', 'Crop')}</h3>
                        <p>
                            {t(
                                '画像の不要な余白を切り取ります。ドラッグして必要な部分だけを残し、要点のみが伝わるコンパクトなスクリーンショットに仕上げます。',
                                'Trim unnecessary margins from the image. Drag to keep only the required parts, making a compact screenshot that conveys just the main point.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/tool-crop.gif" altJa="クロップのGIF" altEn="Crop GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    {/* 17. クリップボードにコピー */}
                    <article className="feature-section">
                        <h3>{t('クリップボードにコピー', 'Copy to Clipboard')} <span className="shortcut-badge">Cmd/Ctrl+C</span></h3>
                        <p>
                            {t(
                                'トップバー右側にあるコピーボタン、またはショートカットキーを押すだけで、完成した画像をクリップボードに保存します。そのままSlackやGitHubにペースト可能です。',
                                'Instantly save the finished image to your clipboard using the copy button on the top right or a shortcut key. Paste the result directly into Slack or GitHub.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/tool-copy.gif" altJa="コピーのGIF" altEn="Copy GIF" t={t} />
                    </article>

                    <div className="feature-divider" />

                    {/* 18. 画像としてダウンロード */}
                    <article className="feature-section">
                        <h3>{t('画像としてダウンロード', 'Download as Image')} <span className="shortcut-badge">Cmd/Ctrl+S</span></h3>
                        <p>
                            {t(
                                '作成した画像をPNGファイルとしてローカルPCにダウンロード保存します。高画質のまま資料などに添付したい時に使用します。',
                                'Download the created image to your local PC as a PNG file. Use this when you want to attach high-quality images to documents.'
                            )}
                        </p>
                        <FeatureMedia src="/guide/tool-download.gif" altJa="ダウンロードのGIF" altEn="Download GIF" t={t} />
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
