// All copy, both languages, and the spatial anchors of the content nodes.
// Anchors are in scene units; the silhouette occupies roughly x ∈ [-3.5, 3.5].

export const NODES = [
  {
    id: 'method',
    anchor: { x: -4.7, y: 2.3, z: 2.2 },
    label: { ru: 'метод', en: 'method' },
    sub:   { ru: 'как я думаю', en: 'how i think' },
    panel: {
      ru: {
        kicker: 'метод',
        title: 'Проектирую там, где нет готовых ответов',
        html: `
          <p>Специализируюсь на задачах без референсов — внутренние инструменты,
          новые продукты, физически встроенные интерфейсы. Погружаюсь в контекст
          среды и проектирую от её процессов и ограничений, а не поверх них.</p>
          <p>10+ лет в цифровых продуктах. Основатель инди-студии MythHand,
          ex-Uzum и KazanExpress.</p>
          <p class="aside">Эта страница — тоже метод: интерфейс, который замечает
          присутствие раньше, чем вы успеваете кликнуть. Вся обработка происходит
          на вашем устройстве.</p>`,
      },
      en: {
        kicker: 'method',
        title: 'I design where no ready answers exist',
        html: `
          <p>I specialise in problems without references — internal tools, new
          products, physically embedded interfaces. I immerse into the context of
          the environment and design from its processes and constraints, not on
          top of them.</p>
          <p>10+ years in digital products. Founder of the MythHand indie studio,
          ex-Uzum and KazanExpress.</p>
          <p class="aside">This page is the method too: an interface that notices
          presence before you get to click. Everything runs on your device.</p>`,
      },
    },
  },
  {
    id: 'warehouse',
    anchor: { x: 4.8, y: 1.2, z: 3.0 },
    label: { ru: 'склад ke × uzum', en: 'warehouse ke × uzum' },
    sub:   { ru: 'sla 72 → 100', en: 'sla 72 → 100' },
    panel: {
      ru: {
        kicker: 'кейс · kazanexpress × uzum',
        title: 'Приёмка склада: от вопроса про стол — до пересборки процесса',
        html: `
          <div class="metrics">
            <div><b>72% → 100%</b><span>SLA при кратном росте трафика SKU</span></div>
            <div><b>7% → 2%</b><span>ошибки при приёмке</span></div>
            <div><b>30 → 18 ч</b><span>среднее время размещения</span></div>
          </div>
          <h3>Проблема</h3>
          <p>Склад маркетплейса решал пропускную способность экстенсивно: больше
          столов пересчёта, камеры, дополнительные отчёты поверх основного
          процесса. Существующий интерфейс не был спроектирован под физический
          процесс — ручной ввод количества как источник ошибок, мелкий текст,
          отсутствие потока для проблемного товара. SLA в 24 часа выполнялся
          на 72%.</p>
          <h3>Подход</h3>
          <p>Вышел на склад физически. Изучил операционный процесс изнутри —
          вплоть до того, что скотчем размечал рабочее место на полу. Ключевое
          ограничение: интерфейс требовал клавиатуры и мыши, тогда как весь
          процесс строится на сканировании — руки заняты, внимание на физическом
          действии.</p>
          <h3>Решение</h3>
          <p>Интерфейс под физическую реальность склада: scan-first, без
          клавиатуры как основного ввода. Поля шаблонизированы с учётом всех
          зависимостей и развилок — интерфейс разворачивается пошагово, формируя
          страницу, по которой можно вернуться к любому шагу без потери
          контекста. Переработка стола пересчёта потянула за собой переосмысление
          приёмки целиком.</p>`,
      },
      en: {
        kicker: 'case · kazanexpress × uzum',
        title: 'Warehouse inbound: from a question about a desk to rebuilding the process',
        html: `
          <div class="metrics">
            <div><b>72% → 100%</b><span>SLA under multiplying SKU traffic</span></div>
            <div><b>7% → 2%</b><span>inbound errors</span></div>
            <div><b>30 → 18 h</b><span>average time to placement</span></div>
          </div>
          <h3>Problem</h3>
          <p>The marketplace warehouse scaled throughput extensively: more
          recount desks, cameras, extra reports layered on top of the core
          process. The existing interface was not designed for the physical
          process — manual quantity input as a source of errors, tiny text, no
          flow for problem goods. The 24-hour SLA was met 72% of the time.</p>
          <h3>Approach</h3>
          <p>I went to the warehouse floor myself and studied the operation from
          the inside — down to marking out a workstation on the floor with tape.
          The key constraint: the interface demanded keyboard and mouse, while
          the whole workflow is built around scanning — hands busy, attention on
          the physical action.</p>
          <h3>Solution</h3>
          <p>An interface designed for the physical reality of the floor:
          scan-first, no keyboard as primary input. Fields are templated around
          every dependency and branch — the interface unfolds step by step into a
          page you can walk back through without losing context. Redesigning one
          desk pulled the whole inbound process into a rethink.</p>`,
      },
    },
  },
  {
    id: 'mythhand',
    anchor: { x: -5.0, y: -0.3, z: 2.6 },
    label: { ru: 'mythhand', en: 'mythhand' },
    sub:   { ru: 'студия · игры', en: 'studio · games' },
    panel: {
      ru: {
        kicker: 'студия',
        title: 'MythHand — инди-студия, которую развиваю как продукт',
        html: `
          <p>Настольные игры в финальном продакшне — тиражи 100 и 200
          экземпляров — и веб-инструменты для нишевых сообществ. Каждый проект
          проходит полный цикл: от концепции до выхода на рынок.</p>
          <p>Смотрю на них одновременно как дизайнер и как основатель:
          «Release любой ценой», «Бармены: последний ингредиент», радио и
          мини-игры вокруг вселенной студии.</p>
          <p><a href="https://mythhand.com/" target="_blank" rel="noopener">mythhand.com ↗</a></p>`,
      },
      en: {
        kicker: 'studio',
        title: 'MythHand — an indie studio I run as a product',
        html: `
          <p>Board games in final production — print runs of 100 and 200 —
          and web tools for niche communities. Every project goes the full
          cycle: from concept to market.</p>
          <p>I look at them as a designer and as a founder at once:
          “Release at Any Cost”, “Bartenders: The Last Ingredient”, a web radio
          and mini-games around the studio's universe.</p>
          <p><a href="https://mythhand.com/" target="_blank" rel="noopener">mythhand.com ↗</a></p>`,
      },
    },
  },
  {
    id: 'radio',
    anchor: { x: -4.0, y: -2.5, z: 1.6 },
    label: { ru: 'radio', en: 'radio' },
    sub:   { ru: 'design & vibecode', en: 'design & vibecode' },
    panel: {
      ru: {
        kicker: 'web · mvp',
        title: 'MythHand Radio',
        html: `
          <p>Веб-радио для сообщества студии. Спроектировано и собрано в
          одиночку — design &amp; vibecode: от канона золотой сетки в UI-процессе
          до работающего десктопного MVP и виджета.</p>
          <p class="aside">Тот же принцип, что и на этой странице: маленькая
          команда из одного человека доводит вещь до работающего продукта.</p>`,
      },
      en: {
        kicker: 'web · mvp',
        title: 'MythHand Radio',
        html: `
          <p>A web radio for the studio's community. Designed and built solo —
          design &amp; vibecode: from a golden-grid canon in the UI process to a
          working desktop MVP and a widget.</p>
          <p class="aside">Same principle as this page: a one-person team taking
          a thing all the way to a working product.</p>`,
      },
    },
  },
  {
    id: 'uzum',
    anchor: { x: 4.4, y: 2.9, z: 1.4 },
    label: { ru: 'склад uzum', en: 'uzum warehouse' },
    sub:   { ru: 'инструмент сотрудника', en: 'worker tooling' },
    panel: {
      ru: {
        kicker: 'кейс · uzum',
        title: 'Приложение сотрудника склада',
        html: `
          <p>Проектирование флоу приложения для сотрудников склада Uzum —
          складская тема на новом масштабе: другой рынок, другие процессы.</p>
          <p>Принцип тот же: интерфейс проектируется от физического процесса —
          скан, шаг, подтверждение — а не поверх него. Продолжение подхода,
          который дал 100% SLA на приёмке KazanExpress.</p>`,
      },
      en: {
        kicker: 'case · uzum',
        title: 'Warehouse worker app',
        html: `
          <p>Flow design for the Uzum warehouse worker app — the warehouse theme
          at a new scale: different market, different processes.</p>
          <p>The principle holds: the interface is designed from the physical
          process — scan, step, confirm — not on top of it. A continuation of the
          approach that took KazanExpress inbound to 100% SLA.</p>`,
      },
    },
  },
  {
    id: 'path',
    anchor: { x: 5.0, y: -1.7, z: 2.0 },
    label: { ru: 'путь', en: 'path' },
    sub:   { ru: '10+ лет', en: '10+ years' },
    panel: {
      ru: {
        kicker: 'путь',
        title: '10+ лет: от вёрстки до систем',
        html: `
          <ul class="timeline">
            <li><i>2024 — сейчас</i><b>Founding Product Designer</b><span>MythHand</span></li>
            <li><i>2021 — 2024</i><b>Ведущий продуктовый дизайнер</b><span>Uzum · Ташкент</span></li>
            <li><i>2020 — 2021</i><b>Старший продуктовый дизайнер</b><span>KazanExpress · Иннополис</span></li>
            <li><i>2019 — 2020</i><b>UX-дизайнер</b><span>Direct Line · проекты для клиентов из США</span></li>
            <li><i>до 2019</i><b>Дизайн в продуктах и студиях</b><span>Invite taxi, AIRA Lab и другие · Тольятти</span></li>
          </ul>
          <p><a href="assets/Product_Design_Dmitry_Togulev.pdf" target="_blank" rel="noopener">резюме, pdf ↗</a></p>`,
      },
      en: {
        kicker: 'path',
        title: '10+ years: from markup to systems',
        html: `
          <ul class="timeline">
            <li><i>2024 — now</i><b>Founding Product Designer</b><span>MythHand</span></li>
            <li><i>2021 — 2024</i><b>Lead Product Designer</b><span>Uzum · Tashkent</span></li>
            <li><i>2020 — 2021</i><b>Senior Product Designer</b><span>KazanExpress · Innopolis</span></li>
            <li><i>2019 — 2020</i><b>UX Designer</b><span>Direct Line · projects for US clients</span></li>
            <li><i>before 2019</i><b>Design across products and studios</b><span>Invite taxi, AIRA Lab and others · Togliatti</span></li>
          </ul>
          <p><a href="assets/Product_Design_Dmitry_Togulev.pdf" target="_blank" rel="noopener">résumé, pdf ↗</a></p>`,
      },
    },
  },
  {
    id: 'contact',
    anchor: { x: 0.2, y: -3.3, z: 3.4 },
    label: { ru: 'связь', en: 'contact' },
    sub:   { ru: 'открыт к работе', en: 'open to work' },
    panel: {
      ru: {
        kicker: 'связь',
        title: 'Открыт к задачам без готовых ответов',
        html: `
          <ul class="links">
            <li><a href="https://t.me/DimaDimbo" target="_blank" rel="noopener">telegram — @DimaDimbo ↗</a></li>
            <li><a href="mailto:dimbo.dancer@gmail.com">почта — dimbo.dancer@gmail.com</a></li>
            <li><a href="https://www.instagram.com/dima_dimbo/" target="_blank" rel="noopener">instagram — @dima_dimbo ↗</a></li>
            <li><a href="assets/Product_Design_Dmitry_Togulev.pdf" target="_blank" rel="noopener">резюме, pdf ↗</a></li>
          </ul>
          <p class="aside">Быстрее всего отвечаю в телеграме.</p>`,
      },
      en: {
        kicker: 'contact',
        title: 'Open to problems without ready answers',
        html: `
          <ul class="links">
            <li><a href="https://t.me/DimaDimbo" target="_blank" rel="noopener">telegram — @DimaDimbo ↗</a></li>
            <li><a href="mailto:dimbo.dancer@gmail.com">email — dimbo.dancer@gmail.com</a></li>
            <li><a href="https://www.instagram.com/dima_dimbo/" target="_blank" rel="noopener">instagram — @dima_dimbo ↗</a></li>
            <li><a href="assets/Product_Design_Dmitry_Togulev.pdf" target="_blank" rel="noopener">résumé, pdf ↗</a></li>
          </ul>
          <p class="aside">Telegram is the fastest way to reach me.</p>`,
      },
    },
  },
];

export const UI = {
  mark:  { ru: 'тогулев', en: 'togulev' },
  title: { ru: 'Дмитрий Тогулев — живой интерфейс', en: 'Dmitry Togulev — living interface' },

  name:  { ru: 'Дмитрий Тогулев', en: 'Dmitry Togulev' },
  role:  {
    ru: 'продуктовый дизайнер — задачи без готовых ответов',
    en: 'product designer — problems without ready answers',
  },

  invite: {
    h:  { ru: 'Этим интерфейсом управляет присутствие.',
          en: 'This interface is driven by presence.' },
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

  telemetry: {
    eyeOff:  { ru: 'глаз · спит',    en: 'eye · asleep' },
    eyeOn:   { ru: 'глаз · открыт',  en: 'eye · open' },
    mindLoad:{ ru: 'разум',          en: 'mind' },
    mindGpu: { ru: 'разум · gpu',    en: 'mind · gpu' },
    mindCpu: { ru: 'разум · cpu',    en: 'mind · cpu' },
    fps:     { ru: 'к/с',            en: 'fps' },
  },

  contactsMini: [
    { href: 'https://t.me/DimaDimbo', label: { ru: 'telegram', en: 'telegram' } },
    { href: 'mailto:dimbo.dancer@gmail.com', label: { ru: 'почта', en: 'email' } },
    { href: 'assets/Product_Design_Dmitry_Togulev.pdf', label: { ru: 'резюме', en: 'résumé' } },
  ],
};
