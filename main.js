/* ============================================================
   水果电池 · 物理小报交互
   - 模拟电压表（水果 / 电极 / 串联节数）
   - 数据条入场
   - 滚动进度与内容浮现
   - 打印时自动展开问答
   ============================================================ */
(function () {
  "use strict";

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  const mqReduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const reduceMotion = () => mqReduce.matches;

  /* ---------- 内容浮现 ---------- */
  const revealEls = $$(".reveal");
  if ("IntersectionObserver" in window && !reduceMotion()) {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
          revealObserver.unobserve(entry.target);
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -6% 0px" }
    );
    revealEls.forEach((el) => revealObserver.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("is-in"));
  }

  /* ---------- 数据条 ---------- */
  const dataBlock = $(".data");
  if (dataBlock) {
    if ("IntersectionObserver" in window && !reduceMotion()) {
      const dataObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("is-visible");
            dataObserver.disconnect();
          });
        },
        { threshold: 0.25 }
      );
      dataObserver.observe(dataBlock);
    } else {
      dataBlock.classList.add("is-visible");
    }
  }

  /* ---------- 阅读进度 ---------- */
  const progressBar = $("[data-progress]");
  if (progressBar) {
    let ticking = false;
    const updateProgress = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      progressBar.style.transform = `scaleX(${ratio})`;
      ticking = false;
    };
    window.addEventListener(
      "scroll",
      () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(updateProgress);
      },
      { passive: true }
    );
    window.addEventListener("resize", updateProgress);
    window.addEventListener("load", updateProgress);
    updateProgress();
  }

  /* ---------- 电压表刻度 ---------- */
  const tickGroup = $("[data-ticks]");
  const SVG_NS = "http://www.w3.org/2000/svg";
  if (tickGroup) {
    const CX = 150;
    const CY = 160;
    const R = 110;
    const A0 = -58;
    const A1 = 58;

    for (let i = 0; i <= 30; i += 1) {
      const value = Number((i * 0.1).toFixed(1));
      const angle = ((A0 + (value / 3) * (A1 - A0)) * Math.PI) / 180;
      const isMajor = i % 10 === 0;
      const isMid = i % 5 === 0;
      const length = isMajor ? 17 : isMid ? 11 : 6;
      const sin = Math.sin(angle);
      const cos = Math.cos(angle);

      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", (CX + R * sin).toFixed(2));
      line.setAttribute("y1", (CY - R * cos).toFixed(2));
      line.setAttribute("x2", (CX + (R - length) * sin).toFixed(2));
      line.setAttribute("y2", (CY - (R - length) * cos).toFixed(2));
      line.setAttribute("class", isMajor ? "dial__tick dial__tick--major" : isMid ? "dial__tick dial__tick--mid" : "dial__tick");
      tickGroup.appendChild(line);

      if (isMajor) {
        const labelRadius = 78;
        const label = document.createElementNS(SVG_NS, "text");
        label.setAttribute("x", (CX + labelRadius * sin).toFixed(2));
        label.setAttribute("y", (CY - labelRadius * cos).toFixed(2));
        label.setAttribute("class", "dial__num");
        label.setAttribute("dominant-baseline", "middle");
        label.textContent = String(value);
        tickGroup.appendChild(label);
      }
    }
  }

  /* ---------- 模拟实验台 ---------- */
  const fruitButtons = $$(".chip[data-fruit]");
  const pairButtons = $$(".chip[data-pair]");
  const seriesButtons = $$(".chip[data-series]");
  const bars = $$(".bar[data-fruit]");

  const needle = $("[data-needle]");
  const readoutNum = $("[data-readout-num]");
  const verdictMain = $("[data-verdict]");
  const verdictSub = $("[data-verdict-sub]");
  const formula = $("[data-formula]");
  const terminalPos = $("[data-terminal-pos]");
  const terminalNeg = $("[data-terminal-neg]");
  const led = $("[data-led]");
  const ledText = $("[data-led-text]");

  if (fruitButtons.length && pairButtons.length && seriesButtons.length && needle && readoutNum) {
    const LED_VOLTAGE = 1.8;
    const fruits = new Map();
    fruitButtons.forEach((btn) => {
      fruits.set(btn.dataset.fruit, {
        name: btn.dataset.name || btn.textContent.trim(),
        voltage: Number(btn.dataset.value)
      });
    });

    const pairs = new Map();
    pairButtons.forEach((btn) => {
      pairs.set(btn.dataset.pair, {
        name: btn.dataset.name,
        factor: Number(btn.dataset.factor),
        pos: btn.dataset.pos,
        neg: btn.dataset.neg
      });
    });

    const pressedValue = (buttons, attr, fallback) => {
      const active = buttons.find((btn) => btn.getAttribute("aria-pressed") === "true");
      return (active && active.dataset[attr]) || fallback;
    };

    const state = {
      fruit: pressedValue(fruitButtons, "fruit", "pomelo"),
      pair: pressedValue(pairButtons, "pair", "cuzn"),
      series: Number(pressedValue(seriesButtons, "series", "1"))
    };

    let currentReadout = 0;
    let readoutFrame = 0;

    const format = (value) => value.toFixed(2);
    const volts = (value) => `${format(value)}\u00A0V`;

    const setReadout = (value, instant) => {
      const target = Number.isFinite(value) ? value : 0;
      if (instant || reduceMotion()) {
        cancelAnimationFrame(readoutFrame);
        readoutNum.textContent = format(target);
        currentReadout = target;
        return;
      }

      const from = currentReadout;
      const start = performance.now();
      const duration = 620;
      cancelAnimationFrame(readoutFrame);

      const step = (now) => {
        const progress = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        const valueNow = from + (target - from) * eased;
        readoutNum.textContent = format(valueNow);
        currentReadout = valueNow;
        if (progress < 1) {
          readoutFrame = requestAnimationFrame(step);
        } else {
          currentReadout = target;
          readoutNum.textContent = format(target);
        }
      };
      readoutFrame = requestAnimationFrame(step);
    };

    const syncPressed = () => {
      fruitButtons.forEach((btn) => btn.setAttribute("aria-pressed", String(btn.dataset.fruit === state.fruit)));
      pairButtons.forEach((btn) => btn.setAttribute("aria-pressed", String(btn.dataset.pair === state.pair)));
      seriesButtons.forEach((btn) => btn.setAttribute("aria-pressed", String(Number(btn.dataset.series) === state.series)));
      bars.forEach((bar) => bar.classList.toggle("is-active", bar.dataset.fruit === state.fruit));
    };

    const describe = (fruit, pair, series, single, total) => {
      let main;
      let sub;

      if (pair.factor === 0) {
        main = `${series} 节串联，但两块都是${pair.pos}——电压 0.00\u00A0V。`;
        sub = "同种金属之间无法形成电势差。换回铜片和锌片试试。";
        return { main, sub };
      }

      main =
        series === 1
          ? `1 节${fruit.name}电池，${pair.pos} ＋ / ${pair.neg} －，电压约 ${volts(total)}。`
          : `${series} 节${fruit.name}电池串联，电压相加到 ${volts(total)}。`;

      if (total >= LED_VOLTAGE) {
        sub = "达到红色 LED 约 1.8\u00A0V 的导通电压 —— 模拟中它微微发亮，真实实验里亮度会很弱。";
      } else if (series > 1) {
        sub = `离 LED 的门槛还差 ${volts(LED_VOLTAGE - total)}。再多串一节试试。`;
      } else if (pair.factor !== 1) {
        sub = `换用${pair.name}后，单节电压约为铜—锌组合的 ${Math.round(pair.factor * 100)}%。`;
      } else {
        sub = "水果电池的电压很小，但足够让电压表的指针动起来。";
      }
      return { main, sub };
    };

    const render = (instant) => {
      const fruit = fruits.get(state.fruit) || fruits.get("pomelo");
      const pair = pairs.get(state.pair) || pairs.get("cuzn");
      const single = Math.round(fruit.voltage * pair.factor * 100) / 100;
      const total = Math.round(single * state.series * 100) / 100;
      const angle = -58 + (Math.min(total, 3) / 3) * 116;

      needle.style.transform = `rotate(${angle}deg)`;
      setReadout(total, instant);

      terminalPos.textContent = `＋ ${pair.pos}`;
      terminalNeg.textContent = `－ ${pair.neg}`;
      formula.textContent = `${volts(single)} × ${state.series} 节 ≈ ${volts(total)}`;

      const copy = describe(fruit, pair, state.series, single, total);
      verdictMain.textContent = copy.main;
      verdictSub.textContent = copy.sub;

      const lit = total >= LED_VOLTAGE;
      led.classList.toggle("is-on", lit);
      ledText.textContent = lit ? "LED 微亮 · 电流很小" : "LED 未点亮";
    };

    fruitButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        state.fruit = btn.dataset.fruit;
        syncPressed();
        render(false);
      });
    });

    pairButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        state.pair = btn.dataset.pair;
        syncPressed();
        render(false);
      });
    });

    seriesButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        state.series = Number(btn.dataset.series);
        syncPressed();
        render(false);
      });
    });

    syncPressed();
    render(true);
  }
})();
