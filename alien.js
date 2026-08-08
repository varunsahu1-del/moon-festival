(function () {
  const style = document.createElement('style');
  style.textContent = `
    #scroll-alien {
      position: fixed;
      right: clamp(10px, 2.5vw, 28px);
      z-index: 900;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.9s ease;
      will-change: transform, top;
    }
    #scroll-alien.vis { opacity: 0.82; }
    #scroll-alien svg { display: block; }

    @keyframes alienDrift {
      0%   { transform: translateY(0)    rotate(-6deg) scaleX(1); }
      25%  { transform: translateY(-9px) rotate(-2deg) scaleX(1.02); }
      50%  { transform: translateY(-14px) rotate(4deg) scaleX(1); }
      75%  { transform: translateY(-6px) rotate(0deg) scaleX(0.98); }
      100% { transform: translateY(0)    rotate(-6deg) scaleX(1); }
    }
    #scroll-alien.vis {
      animation: alienDrift 5.5s cubic-bezier(0.45,0.05,0.55,0.95) infinite;
    }

    @keyframes eyeGlow {
      0%, 100% { opacity: 0.15; }
      50%       { opacity: 0.35; }
    }
    .alien-eye-fill { animation: eyeGlow 3.2s ease-in-out infinite; }

    @keyframes thirdBlink {
      0%, 85%, 100% { opacity: 1; }
      90%            { opacity: 0.1; }
    }
    .alien-third { animation: thirdBlink 6s ease-in-out infinite; }

    @keyframes sparkle {
      0%, 100% { opacity: 0.25; transform: scale(1); }
      50%       { opacity: 0.7;  transform: scale(1.4); }
    }
    .alien-spark:nth-child(1) { animation: sparkle 2.1s 0s   ease-in-out infinite; }
    .alien-spark:nth-child(2) { animation: sparkle 2.8s 0.7s ease-in-out infinite; }
    .alien-spark:nth-child(3) { animation: sparkle 2.4s 1.4s ease-in-out infinite; }
    .alien-spark:nth-child(4) { animation: sparkle 3.1s 0.3s ease-in-out infinite; }
  `;
  document.head.appendChild(style);

  const wrap = document.createElement('div');
  wrap.id = 'scroll-alien';
  wrap.setAttribute('aria-hidden', 'true');
  wrap.innerHTML = `
<svg width="58" height="80" viewBox="0 0 58 80" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- sparkles -->
  <g class="alien-spark">
    <path d="M50 10 L51 13 L54 13 L51.5 14.8 L52.5 18 L50 16 L47.5 18 L48.5 14.8 L46 13 L49 13 Z"
      fill="#B06030" opacity="0.6"/>
  </g>
  <g class="alien-spark">
    <circle cx="6" cy="22" r="1.6" fill="#EDD4B2" opacity="0.4"/>
  </g>
  <g class="alien-spark">
    <path d="M53 38 L53.7 40.2 L56 40.2 L54.2 41.5 L54.8 43.8 L53 42.4 L51.2 43.8 L51.8 41.5 L50 40.2 L52.3 40.2 Z"
      fill="#EDD4B2" opacity="0.35" transform="scale(0.65) translate(30,18)"/>
  </g>
  <g class="alien-spark">
    <circle cx="7" cy="55" r="1.1" fill="#B06030" opacity="0.5"/>
  </g>

  <!-- antenna -->
  <line x1="29" y1="3" x2="29" y2="11" stroke="#EDD4B2" stroke-width="1.2" stroke-linecap="round"/>
  <path d="M26 3.5 L29 1 L32 3.5" stroke="#EDD4B2" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" fill="none"/>

  <!-- head dome – wide alien silhouette -->
  <path d="M13 22 Q13 9 29 9 Q45 9 45 22 L43 33 Q29 37 15 33 Z"
    stroke="#EDD4B2" stroke-width="1.3" fill="rgba(237,212,178,0.04)" stroke-linejoin="round"/>

  <!-- tribal cheek marks -->
  <path d="M14 25 Q11 27 13 29" stroke="rgba(237,212,178,0.35)" stroke-width="0.8" fill="none" stroke-linecap="round"/>
  <path d="M44 25 Q47 27 45 29" stroke="rgba(237,212,178,0.35)" stroke-width="0.8" fill="none" stroke-linecap="round"/>

  <!-- eyes – large almond -->
  <path d="M15 22 Q20 17 25 22 Q20 27 15 22 Z"
    stroke="#EDD4B2" stroke-width="1" stroke-linejoin="round" fill="none"/>
  <ellipse cx="20" cy="22" rx="3.5" ry="3.5" class="alien-eye-fill" fill="rgba(237,212,178,0.18)"/>
  <ellipse cx="20" cy="22" rx="1.3" ry="1.8" fill="#EDD4B2" opacity="0.85"/>

  <path d="M33 22 Q38 17 43 22 Q38 27 33 22 Z"
    stroke="#EDD4B2" stroke-width="1" stroke-linejoin="round" fill="none"/>
  <ellipse cx="38" cy="22" rx="3.5" ry="3.5" class="alien-eye-fill" fill="rgba(237,212,178,0.18)"/>
  <ellipse cx="38" cy="22" rx="1.3" ry="1.8" fill="#EDD4B2" opacity="0.85"/>

  <!-- third eye / bindi -->
  <circle cx="29" cy="15" r="2.2" fill="#B06030" class="alien-third"/>
  <circle cx="29" cy="15" r="0.9" fill="#EDD4B2" class="alien-third"/>

  <!-- nose dots -->
  <circle cx="27" cy="28" r="0.9" fill="rgba(237,212,178,0.45)"/>
  <circle cx="31" cy="28" r="0.9" fill="rgba(237,212,178,0.45)"/>

  <!-- mouth – thin curve -->
  <path d="M23 31 Q29 34.5 35 31" stroke="rgba(237,212,178,0.45)" stroke-width="0.9" fill="none" stroke-linecap="round"/>

  <!-- neck -->
  <line x1="24" y1="33" x2="23" y2="38" stroke="#EDD4B2" stroke-width="1.1" stroke-linecap="round"/>
  <line x1="34" y1="33" x2="35" y2="38" stroke="#EDD4B2" stroke-width="1.1" stroke-linecap="round"/>

  <!-- body -->
  <path d="M19 38 Q29 35 39 38 L37 54 Q29 57 21 54 Z"
    stroke="#EDD4B2" stroke-width="1.2" fill="rgba(237,212,178,0.04)" stroke-linejoin="round"/>

  <!-- tribal chest mark – downward triangle -->
  <path d="M25 41 L29 46 L33 41" stroke="rgba(237,212,178,0.55)" stroke-width="0.9" fill="none" stroke-linejoin="round"/>
  <line x1="29" y1="46" x2="29" y2="51" stroke="rgba(237,212,178,0.35)" stroke-width="0.8" stroke-dasharray="2 1.2"/>

  <!-- arms spread – falling/flying pose -->
  <path d="M19 40 Q10 37 3 41" stroke="#EDD4B2" stroke-width="1.2" stroke-linecap="round" fill="none"/>
  <path d="M1 39 L3 41 L3 44" stroke="#EDD4B2" stroke-width="1" stroke-linecap="round" fill="none"/>

  <path d="M39 40 Q48 37 55 41" stroke="#EDD4B2" stroke-width="1.2" stroke-linecap="round" fill="none"/>
  <path d="M57 39 L55 41 L55 44" stroke="#EDD4B2" stroke-width="1" stroke-linecap="round" fill="none"/>

  <!-- legs spread -->
  <path d="M24 54 Q19 63 14 69" stroke="#EDD4B2" stroke-width="1.1" stroke-linecap="round" fill="none"/>
  <path d="M12 67 L14 69 L17 68" stroke="#EDD4B2" stroke-width="0.9" stroke-linecap="round" fill="none"/>

  <path d="M34 54 Q39 63 44 69" stroke="#EDD4B2" stroke-width="1.1" stroke-linecap="round" fill="none"/>
  <path d="M46 67 L44 69 L41 68" stroke="#EDD4B2" stroke-width="0.9" stroke-linecap="round" fill="none"/>
</svg>`;
  document.body.appendChild(wrap);

  let raf = null;
  function onScroll() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = null;
      const scrollY = window.scrollY;
      const maxScroll = Math.max(1, document.body.scrollHeight - window.innerHeight);
      const progress = Math.min(1, scrollY / maxScroll);

      // alien descends from 12vh to 82vh as page scrolls
      const topVh = 12 + progress * 70;
      wrap.style.top = topVh + 'vh';

      if (scrollY > 80) {
        wrap.classList.add('vis');
      } else {
        wrap.classList.remove('vis');
      }
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();
