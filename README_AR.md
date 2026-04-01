<div dir="rtl">

# FindX

<div align="center">
  **توقف عن الاتصال العشوائي. ابدأ بالبحث الذكي بالذكاء الاصطناعي.**

 FindX يكتشف الشركات، يحلل مواقعها الإلكترونية، ويكتب رسائل تواصل شخصية — كل ذلك تلقائياً باستخدام 3 وكلاء.

  <img src="images/dashboard.png" alt="لوحة تحكم FindX" width="100%" />


  العربية | [ English ](README.md)

  [![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-ادعم%20المشروع-FFDD00?style=flat&logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/mrarabai)

  --- 
</div>

<p align="center">
  <img src="images/agent-pipeline.png" alt="خط أنابيب الوكلاء" width="100%" />
</p>

## كيف يعمل

ثلاثة وكلاء ذكاء اصطناعي يعملون بالتسلسل، بشكل آلي بالكامل:

1. **وكيل البحث** — يجد الشركات المطابقة لاستعلامك عبر سجلات تجارية متعددة الدول (هولندا، بريطانيا، ألمانيا، فرنسا، بلجيكا، أمريكا، الإمارات، والمزيد) و Google Places. يدعم البحث بالإنجليزية والهولندية والعربية.
2. **وكيل التحليل** — يدقق كل موقع باستخدام Lighthouse، يكتشف التقنيات المستخدمة، يقيّم من 0–100، يحدد الفرص بما في ذلك إمكانات الأتمتة وتسريب الإيرادات
3. **وكيل التواصل** — يكتب رسائل تواصل شخصية بالإنجليزية أو الهولندية أو العربية تشير إلى نتائج محددة (مثل *"موقعك يحتاج 8.2 ثانية للتحميل"*)

**اكتشف ← حلل ← تواصل ← تتبع**

> **دعم متعدد اللغات**: ابحث بالإنجليزية أو الهولندية أو العربية. يتم إنشاء رسائل التواصل باللغة المختارة — مع دعم كامل للعربية للشركات في الشرق الأوسط وشمال أفريقيا.

<p align="center">
  <img src="images/pipeline-kanban.png" alt="لوحة كانبان" width="100%" />
</p>

أدِر كل عميل محتمل عبر لوحة كانبان بالسحب والإفلات — من الاكتشاف إلى الربح/الخسارة.

---

## المتطلبات الأساسية

| المتطلب | الإصدار | السبب |
|---------|---------|-------|
| **Node.js** | 20+ | بيئة تشغيل خادم API وأدوات البناء |
| **npm** | 10+ | مدير الحزم |
| **Docker** | الأحدث | يشغل PostgreSQL و Redis ومتصفح Lightpanda |
| **Git** | الأحدث | التحكم بالإصدارات |
| **مفتاح AI API** | — | واجهة GLM أو OpenAI لتوليد الرسائل |

## دليل التثبيت (خطوة بخطوة)

### الخطوة 1: النسخ والتثبيت

```bash
git clone https://github.com/MrFadiAi/FinX.git
cd FinX
npm install
```

### الخطوة 2: تشغيل البنية التحتية

```bash
docker compose up -d
```

هذا يشغل ثلاث حاويات Docker:

| الخدمة | المنفذ | الغرض |
|--------|--------|-------|
| PostgreSQL | 5432 | قاعدة البيانات |
| Redis | 6379 | طوابير المهام في الخلفية |
| Lightpanda | 9222 | متصفح خفيف لاستخراج البيانات |

تحقق من تشغيلها:

```bash
docker compose ps
```

### الخطوة 3: إعداد البيئة

```bash
cp .env.example .env
```

افتح `.env` واملأ القيم **المطلوبة** كحد أدنى:

```env
# مطلوب — التطبيق لن يعمل بدونها
DATABASE_URL=postgresql://findx:findx@localhost:5432/findx
REDIS_URL=redis://localhost:6379

# مطلوب — ميزات الذكاء الاصطناعي
GLM_API_KEY=your-api-key-here
GLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
GLM_MODEL=glm-5.1
```

**اختياري** (للوظائف الكاملة):

```env
# إرسال البريد — بدونه تُحفظ الرسائل كمسودات فقط
RESEND_API_KEY=re_xxxxxxxxxxxxx
EMAIL_FROM=hello@yourdomain.com

# مصادر بيانات الأعمال (دعم دولي)
KVK_API_KEY=your-kvk-key
GOOGLE_MAPS_API_KEY=your-google-key
```

### الخطوة 4: إعداد قاعدة البيانات

```bash
npm run db:migrate
npm run db:seed
```

### الخطوة 5: تشغيل خادم API

```bash
npm run dev
```

خادم API يعمل على **http://localhost:3001**. تحقق:

```bash
curl http://localhost:3001/api/health
```

### الخطوة 6: تشغيل لوحة التحكم

افتح **طرفية جديدة** وشغّل:

```bash
npm run dev:web
```

لوحة التحكم تعمل على **http://localhost:3000**.

---

## ماذا يفعل FindX

1. **الاكتشاف** — يجد الشركات عبر سجلات تجارية متعددة (KVK, Companies House, Handelsregister) و Google Places
2. **التحليل** — يدقق المواقع بـ Lighthouse، يكتشف التقنيات، يقيّم من 0-100
3. **التواصل** — ينشئ رسائل تواصل شخصية بـ **الإنجليزية أو الهولندية أو العربية** باستخدام الذكاء الاصطناعي
4. **التتبع** — يراقب فتح الرسائل والردود والارتدادات عبر Resend

## استخدام التطبيق

### لوحة التحكم (`/`)

نظرة عامة على خط الأنابيب — إجمالي العملاء المحتملين، المحللين، المتواصل معهم، والمكاسب. رسم بياني لتوزيع النقاط.

### خط الأنابيب (`/pipeline`)

لوحة كانبان مع العملاء المحتملين عبر المراحل: مكتشف ← قيد التحليل ← محلل ← قيد التواصل ← تم الرد ← مؤهل ← ربح/خسارة.

### الوكلاء (`/agents`)

تبويبان:
- **خط الأنابيب** — شغّل خط تنقيب الذكاء الاصطناعي. أدخل استعلام بحث مثل "مطاعم في أمستردام"، اختر اللغة (**إنجليزية** أو **هولندية** أو **عربية**)، واضغط تشغيل.
- **الوكلاء** — عرض وتكوين كل وكيل (الهوية، الشخصية، الأدوات، المهارات).

### الإعدادات (`/settings`)

إدارة البيانات — مسح جميع البيانات، إعادة تهيئة الوكلاء، استيراد/تصدير CSV.

## دعم اللغات

يمكن توليد رسائل التواصل بثلاث لغات:

| اللغة | الرمز | النمط |
|-------|-------|-------|
| **الإنجليزية** | `en` | إنجليزية احترافية، تهجئة بريطانية |
| **الهولندية** | `nl` | هولندية رسمية (أسلوب u/uw)، عناوين هولندية |
| **العربية** | `ar` | عربية فصحى احترافية، دعم كامل للاتجاه من اليمين لليسار |

## التقنيات المستخدمة

| الطبقة | التقنية |
|--------|---------|
| API | Fastify (Node.js, TypeScript, ESM) |
| قاعدة البيانات | PostgreSQL 16 عبر Prisma ORM |
| الطوابير | BullMQ (مدعوم بـ Redis) |
| الذكاء الاصطناعي | GLM (واجهة متوافقة مع OpenAI) |
| البريد | Resend |
| المتصفح | Lightpanda (CDP) + Playwright Chromium |
| الواجهة | Next.js 15, React 19, Tailwind 4 |
| استخراج البيانات | Cheerio + Playwright |
| بيانات الأعمال | KVK Open API, Google Places API |
| التدقيق | Lighthouse |

## الأوامر المتاحة

| الأمر | الوصف |
|-------|-------|
| `npm run dev` | تشغيل API مع إعادة التحميل (المنفذ 3001) |
| `npm run dev:web` | تشغيل لوحة تحكم Next.js (المنفذ 3000) |
| `npm run build` | فحص تجميع TypeScript |
| `npm run build:web` | بناء Next.js للإنتاج |
| `npm run db:migrate` | تشغيل ترحيلات Prisma |
| `npm run db:seed` | تهيئة المراحل + 3 وكلاء |
| `npm run db:studio` | فتح Prisma Studio |
| `npm run test` | تشغيل الاختبارات (Vitest) |
| `npm run typecheck` | فحص أنواع TypeScript |

## مثال الاستخدام

```bash
# تشغيل خط الأنابيب بالكامل (رسائل إنجليزية)
curl -X POST http://localhost:3001/api/agents/run \
  -H "Content-Type: application/json" \
  -d '{"query":"restaurants in Amsterdam","language":"en","maxResults":10}'

# تشغيل برسائل هولندية
curl -X POST http://localhost:3001/api/agents/run \
  -H "Content-Type: application/json" \
  -d '{"query":"tandartsen in Rotterdam","language":"nl","maxResults":5}'

# تشغيل برسائل عربية (مثال: شركات في دبي)
curl -X POST http://localhost:3001/api/agents/run \
  -H "Content-Type: application/json" \
  -d '{"query":"restaurants in Dubai","language":"ar","maxResults":5}'
```

## مخطط قاعدة البيانات

| النموذج | الوصف | الحقول الرئيسية |
|---------|-------|----------------|
| **Lead** | سجل الشركة | businessName, city, website, status, leadScore |
| **Analysis** | نتائج تدقيق الموقع | score (0-100), findings, opportunities, techStack |
| **Outreach** | سجل البريد | subject, body, tone, language, status |
| **PipelineStage** | أعمدة كانبان | name, order |
| **Agent** | تكوين وكيل AI | identityMd, soulMd, toolsMd, toolNames |
| **AgentLog** | سجلات التنفيذ | phase, tokens, duration, output |
| **AgentPipelineRun** | سجل تشغيل خط الأنابيب | query, status, leadsFound, emailsDrafted |

## حل المشاكل

### "المنفذ 3001 قيد الاستخدام"

```bash
netstat -ano | grep ":3001" | grep LISTENING
taskkill /F /PID <PID>
npm run dev
```

### "خطأ اتصال قاعدة البيانات"

```bash
docker compose ps
docker compose up -d
docker compose restart postgres
```

### "حاويات Docker لا تعمل"

```bash
docker compose down
docker compose up -d
docker compose logs postgres
```

## ادعم المشروع

إذا ساعدك FindX، فكر في دعمني بقهوة:

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow?logo=buymeacoffee&style=for-the-badge)](https://buymeacoffee.com/mrarabai)

## الترخيص

خاص — جميع الحقوق محفوظة.

</div>
