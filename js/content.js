// All copy, both languages, spatial anchors of the content nodes,
// and gallery strips. Facts (dates, metrics) follow the CV pdf.

export const NODES = [
  {
    id: 'method',
    pose: { x: -0.46, rotY: 0.52, scale: 0.92, dim: 0.05 },
    // the spatial grammar is honest: work on the LEFT, the person on the
    // RIGHT — and no node lives on the silhouette's own territory
    anchor: { x: 3.6, y: 2.2, z: 2.2 },
    label: { ru: 'метод', en: 'method' },
    sub:   { ru: 'как я думаю', en: 'how i think' },
    panel: {
      ru: {
        kicker: 'метод',
        title: 'Проектирую там, где нет готовых ответов',
        blocks: [
          { p: 'Специализируюсь на операционных интерфейсах там, где цифровое связано с физическим миром: склад, логистика, реальные рабочие процессы. Погружаюсь в контекст среды и проектирую от её процессов и ограничений, а не поверх них.' },
          { p: '10+ лет в цифровых продуктах. Старший продуктовый дизайнер в маркетплейсах KazanExpress и Uzum, сейчас — фаундер инди-студии MythHand.' },
          { h: 'подход', p: 'Предпочитаю живые исследования вместо массовой аналитики. Прототипы в реальной среде — на компонентах дизайн-системы или vibecoded, а не в prototype-симуляторах.' },
          { h: 'цикл', p: 'Контекст — бизнес, пользователи, разработка → прототипирование → дизайн → сопровождение разработки → оценка результата метриками.' },
          { h: 'инструменты', p: 'Figma, FigJam, Miro, Jira, Notion, Claude Code, Grok.' },
          { aside: 'Эта страница — тоже метод: интерфейс, который замечает присутствие раньше, чем вы успеваете кликнуть. Вся обработка идёт на вашем устройстве.' },
        ],
      },
      en: {
        kicker: 'method',
        title: 'I design where no ready answers exist',
        blocks: [
          { p: 'I specialise in operational interfaces where the digital meets the physical world: warehouses, logistics, real working processes. I immerse into the context of the environment and design from its processes and constraints — not on top of them.' },
          { p: '10+ years in digital products. Senior product designer at the KazanExpress and Uzum marketplaces, now the founder of the MythHand indie studio.' },
          { h: 'approach', p: 'I prefer live field research over mass analytics. Prototypes live in the real environment — built on design-system components or vibecoded, not in prototype simulators.' },
          { h: 'cycle', p: 'Context — business, users, engineering → prototyping → design → shipping alongside the team → measuring the result with metrics.' },
          { h: 'tools', p: 'Figma, FigJam, Miro, Jira, Notion, Claude Code, Grok.' },
          { aside: 'This page is the method too: an interface that notices presence before you get to click. Everything runs on your device.' },
        ],
      },
    },
  },
  {
    id: 'warehouse',
    pose: { x: 0.46, rotY: -0.52, scale: 0.9, dim: 0 },
    anchor: { x: -3.7, y: 2.1, z: 3.0 },
    label: { ru: 'склад ke × uzum', en: 'warehouse ke × uzum' },
    sub:   { ru: 'sla 72 → 100', en: 'sla 72 → 100' },
    panel: {
      ru: {
        kicker: 'кейс · kazanexpress × uzum · 2021–2024',
        title: 'Склад: от вопроса про стол — до системы на две компании',
        blocks: [
          { metrics: [
            ['72% → 100%', 'SLA при кратном росте трафика SKU'],
            ['7% → 2%', 'ошибки при приёмке'],
            ['30 → 18 ч', 'среднее время размещения'],
          ]},
          { h: 'проблема', p: 'Склад маркетплейса решал пропускную способность экстенсивно: больше столов пересчёта, камеры, дополнительные отчёты поверх основного процесса. Существующий интерфейс не был спроектирован под физический процесс — ручной ввод количества как источник ошибок, мелкий текст, отсутствие потока для проблемного товара. SLA в 24 часа выполнялся на 72%.' },
          { h: 'подход', p: 'Вышел на склад физически. Изучил операционный процесс изнутри — вплоть до того, что скотчем размечал рабочее место на полу. Ключевое ограничение: интерфейс требовал клавиатуры и мыши, тогда как весь процесс строится на сканировании — руки заняты, внимание на физическом действии.' },
          { strip: [
            ['assets/gallery/ke-floor.jpg', 'разметка рабочего места скотчем — прямо на полу склада'],
            ['assets/gallery/ke-map.jpg', 'карта процессов приёмки целиком'],
            ['assets/gallery/ke-steps.jpg', 'вариации шагов пересчёта товара'],
          ]},
          { h: 'решение', p: 'Интерфейс под физическую реальность склада: scan-first, без клавиатуры как основного ввода. Поля шаблонизированы с учётом всех зависимостей и развилок — интерфейс разворачивается пошагово, формируя страницу, по которой можно вернуться к любому шагу без потери контекста. Всё — без расширения штата.' },
          { h: 'продолжение · топология', p: 'Следом спроектировал систему управления топологией склада: полная картина перестановок, блокировок и наполнения ячеек взамен Excel-таблиц. После приобретения KazanExpress Магнитом этот подход лёг в основу топологии склада Магнит Маркета.' },
          { h: 'продолжение · uzum', p: 'В 2024 линия склада продолжилась в Uzum: система склада и ПВЗ маркетплейса Узбекистана — то же операционное ядро, развитие того же подхода на новом масштабе. Параллельно временно закрывал позицию дизайн-лида команды — найм, онбординг, ревью работ — и внедрил формат персональных дизайн-спринтов между дизайнером и его кросс-функциональным кластером.' },
          { strip: [
            ['assets/gallery/uzum-flow.jpg', 'uzum — флоу приложения сотрудника склада'],
          ]},
        ],
      },
      en: {
        kicker: 'case · kazanexpress × uzum · 2021–2024',
        title: 'The warehouse: from a question about a desk to a system spanning two companies',
        blocks: [
          { metrics: [
            ['72% → 100%', 'SLA under multiplying SKU traffic'],
            ['7% → 2%', 'inbound errors'],
            ['30 → 18 h', 'average time to placement'],
          ]},
          { h: 'problem', p: 'The marketplace warehouse scaled throughput extensively: more recount desks, cameras, extra reports layered on top of the core process. The existing interface was not designed for the physical process — manual quantity input as a source of errors, tiny text, no flow for problem goods. The 24-hour SLA was met 72% of the time.' },
          { h: 'approach', p: 'I went to the warehouse floor myself and studied the operation from the inside — down to marking out a workstation on the floor with tape. The key constraint: the interface demanded keyboard and mouse, while the whole workflow is built around scanning — hands busy, attention on the physical action.' },
          { strip: [
            ['assets/gallery/ke-floor.jpg', 'marking out the workstation with tape, right on the warehouse floor'],
            ['assets/gallery/ke-map.jpg', 'the full inbound process map'],
            ['assets/gallery/ke-steps.jpg', 'variations of the recount steps'],
          ]},
          { h: 'solution', p: 'An interface designed for the physical reality of the floor: scan-first, no keyboard as primary input. Fields are templated around every dependency and branch — the interface unfolds step by step into a page you can walk back through without losing context. All of it without growing the headcount.' },
          { h: 'follow-up · topology', p: 'Next I designed the warehouse topology management system: a full picture of moves, blocks and cell occupancy instead of Excel sheets. After Magnit acquired KazanExpress, this approach became the foundation of Magnit Market’s warehouse topology.' },
          { h: 'follow-up · uzum', p: 'In 2024 the warehouse line continued at Uzum: the warehouse and pick-up point system of Uzbekistan’s marketplace — the same operational core, the same approach at a new scale. In parallel I temporarily covered the team’s design lead position — hiring, onboarding, reviews — and introduced personal design sprints between a designer and their cross-functional cluster.' },
          { strip: [
            ['assets/gallery/uzum-flow.jpg', 'uzum — the warehouse worker app flow'],
          ]},
        ],
      },
    },
  },
  {
    id: 'games',
    pose: { x: 0.55, rotY: -0.78, scale: 0.72, dim: 0.4 },
    anchor: { x: -3.2, y: -2.4, z: 1.6 },
    label: { ru: 'настолки', en: 'board games' },
    sub:   { ru: 'из цифры — в тираж', en: 'from pixels to print' },
    panel: {
      ru: {
        kicker: 'mythhand · физические продукты',
        title: 'Настольные игры: полный цикл до тиража',
        blocks: [
          { p: 'Две игры на финальной стадии продакшна — тиражи 100 и 200 экземпляров. Концепция, геймдизайн, графика, вёрстка карт, коробка, плейтесты, производство — весь цикл в одних руках, как у дизайнера и как у основателя.' },
          { strip: [
            ['assets/gallery/release-boxes.jpg', '«Release любой ценой» — вариации коробки'],
            ['assets/gallery/release-cards.jpg', '«Release любой ценой» — карты в игре · фото отзыв'],
            ['assets/gallery/bartenders-cards.jpg', '«Бармены: последний ингредиент» — дизайн карт'],
            ['assets/gallery/bartenders-playtest.jpg', '«Бармены» — живой плейтест'],
          ]},
          { p: '«Release любой ценой» — настолка про айтишную гонку к релизу: git-ветки, DDoS, дебаггер и Error 503 как игровые события. «Бармены: последний ингредиент» — карточная игра про сборку коктейлей, проверенная живыми плейтестами в барах.' },
          { aside: 'Потяните полосу с фотографиями — жестом или колесом.' },
        ],
      },
      en: {
        kicker: 'mythhand · physical products',
        title: 'Board games: the full cycle to a print run',
        blocks: [
          { p: 'Two games at the final production stage — print runs of 100 and 200 copies. Concept, game design, artwork, card layout, box, playtests, manufacturing — the whole cycle in one pair of hands, as a designer and as a founder.' },
          { strip: [
            ['assets/gallery/release-boxes.jpg', '“Release at Any Cost” — box variations'],
            ['assets/gallery/release-cards.jpg', '“Release at Any Cost” — cards in play · photo review'],
            ['assets/gallery/bartenders-cards.jpg', '“Bartenders: The Last Ingredient” — card design'],
            ['assets/gallery/bartenders-playtest.jpg', '“Bartenders” — a live playtest'],
          ]},
          { p: '“Release at Any Cost” is a tabletop about the IT race to ship: git branches, DDoS, a debugger and Error 503 as game events. “Bartenders: The Last Ingredient” is a card game about mixing cocktails, proven in live bar playtests.' },
          { aside: 'Drag the photo strip — with a gesture or the wheel.' },
        ],
      },
    },
  },
  {
    id: 'mythhand',
    pose: { x: 0.44, rotY: -0.62, scale: 0.95, dim: 0.15 },
    anchor: { x: -3.9, y: -0.2, z: 2.6 },
    label: { ru: 'mythhand', en: 'mythhand' },
    sub:   { ru: 'студия · веб', en: 'studio · web' },
    panel: {
      ru: {
        kicker: 'студия · с ноября 2025',
        title: 'MythHand — инди-студия, которую веду как продукт',
        blocks: [
          { p: 'Настольные игры и веб-инструменты для нишевых сообществ. Каждый проект проходит полный цикл: концепция, дизайн, продакшн, выход на рынок.' },
          { strip: [
            ['assets/gallery/radio-mvp.jpg', 'MythHand Radio — web · mvp desktop · design & vibecode'],
            ['assets/gallery/radio-grid.jpg', 'ui-процесс — канон золотой сетки'],
            ['assets/gallery/radio-widget.jpg', 'виджет радио — in progress'],
          ]},
          { p: 'MythHand Radio — веб-радио вселенной студии, спроектировано и собрано в одиночку: design & vibecode, от канона золотой сетки до работающего MVP. Рядом — веб-инструмент для танцорской импровизации с физическими дайсами, готовится к публичному запуску.' },
          { h: 'release p2p — в открытую', p: 'Настолка возвращается в цифру: P2P-веб-адаптация собственной «Release любой ценой» в открытой разработке. Монорепозиторий с UI-китом и плейграундом компонентов, впереди мультиплеер поверх WebRTC. Тот же метод в третий раз: design & vibecode.' },
          { strip: [
            ['assets/release-playground.png', 'release p2p — плейграунд ui-кита'],
          ]},
          { links: [
            ['https://mythhand.com/', 'mythhand.com ↗'],
            ['https://github.com/MythHand/ReleaseBoardGameP2P', 'github — release p2p ↗'],
          ] },
        ],
      },
      en: {
        kicker: 'studio · since november 2025',
        title: 'MythHand — an indie studio I run as a product',
        blocks: [
          { p: 'Board games and web tools for niche communities. Every project goes the full cycle: concept, design, production, market release.' },
          { strip: [
            ['assets/gallery/radio-mvp.jpg', 'MythHand Radio — web · desktop mvp · design & vibecode'],
            ['assets/gallery/radio-grid.jpg', 'ui process — a golden-grid canon'],
            ['assets/gallery/radio-widget.jpg', 'the radio widget — in progress'],
          ]},
          { p: 'MythHand Radio is the web radio of the studio’s universe, designed and built solo: design & vibecode, from a golden-grid canon to a working MVP. Next to it — a web tool for dance improvisation with physical dice, preparing for public launch.' },
          { h: 'release p2p — in the open', p: 'The board game returns to the digital: a P2P web adaptation of my own “Release at Any Cost”, developed in the open. A monorepo with a UI kit and a component playground, multiplayer over WebRTC ahead. The same method for the third time: design & vibecode.' },
          { strip: [
            ['assets/release-playground.png', 'release p2p — the ui-kit playground'],
          ]},
          { links: [
            ['https://mythhand.com/', 'mythhand.com ↗'],
            ['https://github.com/MythHand/ReleaseBoardGameP2P', 'github — release p2p ↗'],
          ] },
        ],
      },
    },
  },
  {
    id: 'path',
    pose: { x: -0.52, rotY: 0.42, scale: 0.8, dim: 0.2 },
    anchor: { x: 3.9, y: -0.4, z: 2.0 },
    label: { ru: 'путь', en: 'path' },
    sub:   { ru: '10+ лет', en: '10+ years' },
    panel: {
      ru: {
        kicker: 'путь',
        title: '10+ лет: от вёрстки до операционных систем',
        blocks: [
          { timeline: [
            ['ноябрь 2025 — сейчас', 'Основатель, продуктовый дизайнер', 'MythHand'],
            ['2025', 'Пауза и фриланс', 'переключение на физические продукты, зарождение MythHand'],
            ['май 2024 — декабрь 2024', 'Ведущий продуктовый дизайнер', 'Uzum · Ташкент'],
            ['май 2021 — май 2024', 'Старший продуктовый дизайнер', 'KazanExpress · Иннополис'],
            ['февраль 2020 — апрель 2021', 'UX-дизайнер', 'Direct Line · проекты для клиентов из США и РФ'],
            ['до 2020', 'Дизайн в продуктах и студиях', 'Invite taxi, AIRA Lab, AdEcoSystem и другие · Тольятти'],
          ]},
          { h: 'образование', p: 'Поволжский государственный университет сервиса — бакалавр, «Информационные системы», 2018. Нетология (2016–2017): UX-дизайн, веб-дизайн, дизайн мобильных приложений.' },
          { links: [['assets/Product_Design_Dmitry_Togulev.pdf', 'резюме, pdf ↗']] },
        ],
      },
      en: {
        kicker: 'path',
        title: '10+ years: from markup to operational systems',
        blocks: [
          { timeline: [
            ['november 2025 — now', 'Founder, Product Designer', 'MythHand'],
            ['2025', 'Pause and freelance', 'switching to physical products; MythHand takes shape'],
            ['may 2024 — december 2024', 'Lead Product Designer', 'Uzum · Tashkent'],
            ['may 2021 — may 2024', 'Senior Product Designer', 'KazanExpress · Innopolis'],
            ['february 2020 — april 2021', 'UX Designer', 'Direct Line · projects for US and RU clients'],
            ['before 2020', 'Design across products and studios', 'Invite taxi, AIRA Lab, AdEcoSystem and others · Togliatti'],
          ]},
          { h: 'education', p: 'Volga Region State University of Service — BSc, Information Systems, 2018. Netology (2016–2017): UX design, web design, mobile app design.' },
          { links: [['assets/Product_Design_Dmitry_Togulev.pdf', 'résumé, pdf ↗']] },
        ],
      },
    },
  },
  {
    id: 'contact',
    pose: { x: -0.3, rotY: 0.24, scale: 1.14, dim: 0.5 },
    anchor: { x: 3.5, y: -2.6, z: 3.4 },
    label: { ru: 'связь', en: 'contact' },
    sub:   { ru: 'открыт к работе', en: 'open to work' },
    panel: {
      ru: {
        kicker: 'связь · тольятти · utc+4',
        title: 'Открыт к задачам без готовых ответов',
        blocks: [
          { links: [
            ['https://t.me/DimaDimbo', 'telegram — @DimaDimbo ↗'],
            ['mailto:dimbo.dancer@gmail.com', 'почта — dimbo.dancer@gmail.com'],
            ['https://www.instagram.com/dima_dimbo/', 'instagram — @dima_dimbo ↗'],
            ['assets/Product_Design_Dmitry_Togulev.pdf', 'резюме, pdf ↗'],
          ]},
          { aside: 'Быстрее всего отвечаю в телеграме.' },
        ],
      },
      en: {
        kicker: 'contact · togliatti · utc+4',
        title: 'Open to problems without ready answers',
        blocks: [
          { links: [
            ['https://t.me/DimaDimbo', 'telegram — @DimaDimbo ↗'],
            ['mailto:dimbo.dancer@gmail.com', 'email — dimbo.dancer@gmail.com'],
            ['https://www.instagram.com/dima_dimbo/', 'instagram — @dima_dimbo ↗'],
            ['assets/Product_Design_Dmitry_Togulev.pdf', 'résumé, pdf ↗'],
          ]},
          { aside: 'Telegram is the fastest way to reach me.' },
        ],
      },
    },
  },
];

export const UI = {
  mark:  { ru: 'dimbo', en: 'dimbo' },
  title: { ru: 'Дмитрий Тогулев — живой интерфейс', en: 'Dmitry Togulev — living interface' },

  name:  { ru: 'Дмитрий Тогулев', en: 'Dmitry Togulev' },
  role:  {
    ru: 'продуктовый дизайнер — задачи без готовых ответов',
    en: 'product designer — problems without ready answers',
  },

  invite: {
    h:  { ru: 'Этим интерфейсом управляет присутствие',
          en: 'This interface is driven by presence' },
    // returning visitors get warmth, not surveillance — «помнит» читалось
    // как слежка (полевой вердикт владельца)
    hReturn: { ru: 'С возвращением',
               en: 'Welcome back' },
    a:  { ru: 'позволить ему видеть', en: 'let it see' },
    s:  { ru: 'камера работает локально — изображение не покидает ваш компьютер',
          en: 'the camera runs locally — nothing ever leaves your machine' },
  },

  denied: {
    h:  { ru: 'Договорились. Интерфейс останется спящим.',
          en: 'Fair enough. The interface will stay asleep.' },
    s:  { ru: 'Знакомиться можно и без него:', en: 'We can still meet without it:' },
    a:  { ru: 'передумали — разбудить', en: 'changed your mind — wake it' },
  },

  asleep: {
    h:  { ru: 'Живому зеркалу нужно железо посильнее.',
          en: 'The living mirror needs stronger hardware.' },
    s:  { ru: 'Ничего страшного: портфолио открыто и мышкой — пункты вокруг, клик открывает. Полная версия живёт в Chrome и Opera.',
          en: 'No harm done: the portfolio opens with a mouse — the items are all around, a click opens them. The full version lives in Chrome and Opera.' },
    a:  { ru: 'разбудить зеркало здесь — оно будет неторопливым',
          en: 'wake the mirror here — it will take its time' },
  },

  failed: {
    h:  { ru: 'Разум не загрузился. Такое бывает вдали от сети.',
          en: 'The mind failed to load. It happens far from the network.' },
    s:  { ru: 'Страница живёт на нейросети в вашем браузере — попробуйте перезагрузить. Или просто напишите:',
          en: 'This page runs a neural net inside your browser — try reloading. Or simply write:' },
  },

  mobile: {
    h:  { ru: 'Это зеркало, а не страница.', en: 'This is a mirror, not a page.' },
    s:  { ru: 'Опыту нужны веб-камера и большой экран. Откройте на десктопе — интерфейс заметит вас сам.',
          en: 'The experience needs a webcam and a large screen. Open it on a desktop — the interface will notice you on its own.' },
  },

  close: { ru: 'закрыть', en: 'close' },
  nodeHint: { ru: 'задержи руку — откроется', en: 'hold your hand — it opens' },

  telemetry: {
    eyeOff:  { ru: 'глаз · спит',    en: 'eye · asleep' },
    eyeOn:   { ru: 'глаз · открыт',  en: 'eye · open' },
    mindLoad:{ ru: 'разум',          en: 'mind' },
    mindGpu: { ru: 'разум · gpu',    en: 'mind · gpu' },
    mindCpu: { ru: 'разум · cpu',    en: 'mind · cpu' },
    handsLoad:{ ru: 'руки · грузятся', en: 'hands · loading' },
    handsOn: { ru: 'руки · вижу',    en: 'hands · seen' },
    handsOff:{ ru: 'руки · не вижу', en: 'hands · unseen' },
    handsFail:{ ru: 'руки · недоступны', en: 'hands · unavailable' },
    fps:     { ru: 'к/с',            en: 'fps' },
  },

  contactsMini: [
    { href: 'https://t.me/DimaDimbo', label: { ru: 'telegram', en: 'telegram' } },
    { href: 'mailto:dimbo.dancer@gmail.com', label: { ru: 'почта', en: 'email' } },
    { href: 'assets/Product_Design_Dmitry_Togulev.pdf', label: { ru: 'резюме', en: 'résumé' } },
  ],
};

// Render a panel definition to HTML for the content space.
export function renderPanel(node, lang) {
  const c = node.panel[lang];
  let i = 0;
  const el = (html) => `<div class="blk" style="--i:${i++}">${html}</div>`;
  let out = el(`<p class="kicker">${c.kicker}</p>`) + el(`<h2>${c.title}</h2>`);
  for (const b of c.blocks) {
    if (b.p) out += el(`${b.h ? `<h3>${b.h}</h3>` : ''}<p>${b.p}</p>`);
    else if (b.aside) out += el(`<p class="aside">${b.aside}</p>`);
    else if (b.metrics) out += el(`<div class="metrics">${b.metrics.map(([v, l]) =>
      `<div><b>${v}</b><span>${l}</span></div>`).join('')}</div>`);
    else if (b.timeline) out += el(`<ul class="timeline">${b.timeline.map(([d, t, w]) =>
      `<li><i>${d}</i><b>${t}</b><span>${w}</span></li>`).join('')}</ul>`);
    else if (b.links) out += el(`<ul class="links">${b.links.map(([href, label]) =>
      // pdf résumé is the one link you can take with a gesture (dwell on it);
      // external links deliberately stay mouse-only
      `<li><a href="${href}" ${href.endsWith('.pdf') ? 'download data-dl'
        : href.startsWith('#') ? '' : 'target="_blank" rel="noopener"'}>${label}</a></li>`).join('')}</ul>`);
    else if (b.strip) out += el(`<div class="strip"><div class="strip-track">${b.strip.map(([src, cap]) =>
      `<figure><img src="${src}" alt="${cap}" loading="lazy" draggable="false"><figcaption>${cap}</figcaption></figure>`).join('')}</div></div>`);
  }
  return out;
}
