/* Claude Code 风格的像素小怪：纯 SVG + CSS，没有外部图片。
 * Mascot.mount(box) 会在 box 里创建气泡和形象，返回 { mood, react, say, tip }。
 *   mood(state, text)  设置常驻状态（idle / wave / worry / proud / backup）并说一句话
 *   react(state, text) 临时反应（happy / nod），约 2 秒后回到常驻状态
 */
(function () {
  'use strict';

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var CSS = [
    '.mascot{all:unset;box-sizing:border-box;display:block;cursor:pointer;flex:none;width:84px;line-height:0}',
    '.mascot:focus-visible{outline:2px solid var(--accent,#d97757);outline-offset:4px}',
    '.clawd{width:100%;height:auto;display:block;overflow:visible}',
    '.clawd rect{shape-rendering:crispEdges}',
    '.clawd .m-torso,.clawd .m-arm rect,.clawd .m-leg rect{fill:var(--clawd,#d97757)}',
    '.clawd .m-eye{fill:var(--clawd-eye,#1b1210);transform-box:fill-box;transform-origin:center;transition:transform .12s steps(2)}',
    '.clawd .m-eyes{transform:translateX(calc(var(--lx,0) * .45px))}',
    '.clawd .m-spark rect{fill:var(--clawd-spark,#f5c542)}',
    '.clawd .m-sweat rect{fill:#7ec8ff}',
    '.clawd .m-file>rect:first-child{fill:#f4f1ea}',
    '.clawd .m-file>rect+rect{fill:#c9c2b6}',
    '.clawd .m-spark,.clawd .m-sweat,.clawd .m-file{visibility:hidden}',
    '.clawd .m-arm{transition:transform .15s steps(2)}',

    /* 常驻动画 */
    '.clawd .m-body{animation:cl-bob 1.8s steps(1) infinite}',
    '.clawd .m-eye{animation:cl-blink 4.6s steps(1) infinite}',
    '.clawd .m-armL{animation:cl-sway 3.6s steps(1) infinite}',
    '.clawd .m-armR{animation:cl-sway 3.6s steps(1) infinite 1.8s}',
    '.mascot.pace .m-legA{animation:cl-step .4s steps(1) 4}',
    '.mascot.pace .m-legB{animation:cl-step .4s steps(1) 4 .2s}',
    '@keyframes cl-bob{0%{transform:translateY(0)}50%{transform:translateY(-.5px)}}',
    '@keyframes cl-blink{0%,91%,100%{transform:scaleY(1)}93%,97%{transform:scaleY(.12)}}',
    '@keyframes cl-sway{0%{transform:translateY(0)}50%{transform:translateY(.5px)}}',
    '@keyframes cl-step{0%{transform:translateY(0)}50%{transform:translateY(-.8px)}}',
    '@keyframes cl-jump{0%,100%{transform:translateY(0)}25%{transform:translateY(-1.6px)}50%{transform:translateY(-2.2px)}75%{transform:translateY(-1px)}}',
    '@keyframes cl-nod{0%,100%{transform:translateY(0)}35%{transform:translateY(1px)}70%{transform:translateY(.2px)}}',
    '@keyframes cl-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-.6px)}75%{transform:translateX(.6px)}}',
    '@keyframes cl-wave{0%{transform:translateY(-1.5px)}50%{transform:translateY(-.3px)}}',
    '@keyframes cl-flash{0%{visibility:visible}50%{visibility:hidden}}',

    /* 状态 */
    '.mascot[data-state="happy"] .m-body{animation:cl-jump .6s steps(4) 2}',
    '.mascot[data-state="happy"] .m-eye{animation:none;transform:translateY(.4px) scaleY(.4)}',
    '.mascot[data-state="happy"] .m-arm{animation:none;transform:translateY(-1.2px)}',
    '.mascot[data-state="happy"] .m-spark{visibility:visible;animation:cl-flash .5s steps(1) infinite}',

    '.mascot[data-state="nod"] .m-body{animation:cl-nod .7s steps(3) 2}',

    '.mascot[data-state="worry"] .m-body{animation:cl-shake .5s steps(2) infinite}',
    '.mascot[data-state="worry"] .m-eye{animation:none;transform:translateY(.3px)}',
    '.mascot[data-state="worry"] .m-eyes{transform:translateX(-.4px)}',
    '.mascot[data-state="worry"] .m-sweat{visibility:visible}',

    '.mascot[data-state="proud"] .m-arm{animation:none;transform:translateY(-.8px)}',
    '.mascot[data-state="proud"] .m-eye{animation:none;transform:translateY(.3px) scaleY(.55)}',
    '.mascot[data-state="proud"] .m-spark{visibility:visible}',

    '.mascot[data-state="wave"] .m-armR{animation:cl-wave .5s steps(1) infinite}',

    '.mascot[data-state="backup"] .m-armR{animation:none;transform:translateY(-2px)}',
    '.mascot[data-state="backup"] .m-file{visibility:visible}',

    '.bubble{box-sizing:border-box;min-width:0;min-height:2.6em}',
    '.bubble-text{white-space:pre-wrap;overflow-wrap:anywhere}',
    '.bubble.typing .bubble-text::after{content:"\\258C";margin-left:1px;animation:cl-flash .8s steps(1) infinite}',

    '@media (prefers-reduced-motion:reduce){.clawd *{animation:none!important;transition:none!important}.bubble.typing .bubble-text::after{content:none}}'
  ].join('\n');

  var style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  function r(x, y, w, h, cls) {
    return '<rect' + (cls ? ' class="' + cls + '"' : '') + ' x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '"/>';
  }

  var SVG =
    '<svg class="clawd" viewBox="-1 -4 15 12" aria-hidden="true" focusable="false">' +
    '<g class="m-body">' +
      '<g class="m-spark">' + r(0, -2, 1, 1) + r(12, -3, 1, 1) + r(6, -4, 1, 1) + '</g>' +
      '<g class="m-sweat">' + r(11, -1, 1, 1) + r(11, 0, 1, 1) + '</g>' +
      '<g class="m-arm m-armL">' + r(0, 2, 2, 2) + '</g>' +
      '<g class="m-arm m-armR">' + r(11, 2, 2, 2) + '</g>' +
      '<g class="m-file">' + r(11, -3, 3, 4) + r(11, -2, 2, 1) + r(11, 0, 2, 1) + '</g>' +
      r(2, 0, 9, 5, 'm-torso') +
      '<g class="m-eyes">' + r(4, 1, 1, 2, 'm-eye') + r(8, 1, 1, 2, 'm-eye') + '</g>' +
      '<g class="m-leg m-legA">' + r(3, 5, 1, 2) + r(7, 5, 1, 2) + '</g>' +
      '<g class="m-leg m-legB">' + r(5, 5, 1, 2) + r(9, 5, 1, 2) + '</g>' +
    '</g></svg>';

  var TIPS = [
    '支出记得写备注，月底回头看更清楚。',
    '设个月度预算，用到 80% 我会提醒你。',
    '房租、订阅可以设成固定支出，每月自动记。',
    '月底别忘了备份，在设置里点「备份」。',
    '点环形图下面的分类，可以只看那一类。',
    '想改一笔记录？直接点它就行。'
  ];

  function el(tag, cls) {
    var e = document.createElement(tag);
    e.className = cls;
    return e;
  }

  function mount(box) {
    var bubble = el('div', 'bubble');
    var txt = el('span', 'bubble-text');
    bubble.appendChild(txt);
    var fig = el('button', 'mascot');
    fig.type = 'button';
    fig.setAttribute('aria-label', 'Claude Code 小伙伴，点一下听提示');
    fig.setAttribute('data-state', 'idle');
    fig.innerHTML = SVG;
    box.appendChild(bubble);
    box.appendChild(fig);

    var base = 'idle';
    var typeTimer = null;
    var backTimer = null;
    var tipIdx = Math.floor(Math.random() * TIPS.length);

    function say(text) {
      clearInterval(typeTimer);
      text = text || '';
      if (reduce || !text) {
        txt.textContent = text;
        bubble.classList.remove('typing');
        return;
      }
      var i = 0;
      txt.textContent = '';
      bubble.classList.add('typing');
      typeTimer = setInterval(function () {
        i++;
        txt.textContent = text.slice(0, i);
        if (i >= text.length) {
          clearInterval(typeTimer);
          bubble.classList.remove('typing');
        }
      }, 30);
    }

    function mood(state, text) {
      clearTimeout(backTimer);
      base = state;
      fig.setAttribute('data-state', state);
      if (text != null) say(text);
    }

    function react(state, text) {
      clearTimeout(backTimer);
      fig.setAttribute('data-state', state);
      if (text != null) say(text);
      backTimer = setTimeout(function () {
        fig.setAttribute('data-state', base);
      }, 1300);
    }

    function tip() {
      tipIdx = (tipIdx + 1) % TIPS.length;
      return TIPS[tipIdx];
    }

    fig.addEventListener('click', function () {
      react('happy', tip());
    });

    /* 视线跟随（桌面） */
    var pending = false;
    var lastEvt = null;
    document.addEventListener('mousemove', function (e) {
      lastEvt = e;
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () {
        pending = false;
        if (!lastEvt || box.hidden) return;
        var rc = fig.getBoundingClientRect();
        var dx = (lastEvt.clientX - (rc.left + rc.width / 2)) / (window.innerWidth / 2);
        fig.style.setProperty('--lx', Math.max(-1, Math.min(1, dx)).toFixed(2));
      });
    });

    /* 偶尔踏两步 */
    if (!reduce) {
      setInterval(function () {
        if (box.hidden || fig.getAttribute('data-state') !== 'idle') return;
        fig.classList.add('pace');
        setTimeout(function () { fig.classList.remove('pace'); }, 1700);
      }, 14000);
    }

    return { mood: mood, react: react, say: say, tip: tip };
  }

  window.Mascot = { mount: mount };
})();
