import type { Message } from '@kernhq/ui'

/**
 * This module's strings, in every locale the platform ships.
 *
 * **Data only, and deliberately so:** this file imports nothing but a type, which is what lets a
 * test load the bundles and check them. `i18n.ts` next door pulls in `@kernhq/ui` for `scopedT`,
 * and that entry point reaches the Svelte components — so anything importing it drags a compiler
 * into whatever is doing the importing.
 *
 * A module ships separately from the app, so Paraglide — which compiles only the app's
 * `messages/*.json` — cannot see these. The shell merges them into the framework's message runtime
 * when it registers the module. Keys are namespaced by module id, which is what keeps two modules
 * from colliding in that one map.
 *
 * A **counted** message is a map of CLDR plural category to string, never a string with `{n}` in
 * it: `t(key, { n })` picks the form through `Intl.PluralRules`. English has two categories and
 * Arabic has six, and which one applies is that answer rather than yours.
 *
 * Words every module needs and none owns — Save, Cancel, Retry — come from the framework's `common`
 * bundle (`t('common.save')`). Do not copy them here.
 *
 * Two strings on the *not configured* screen are deliberately absent: the environment variable and
 * the Compose command. They are not English, they are literals an administrator types, and a
 * translated `docker compose --profile calls up -d` is a command that does not work.
 */

export const en: Record<string, Message> = {
  'meet.nav': 'Meetings',
  'meet.title': 'Meeting',
  'meet.command_start': 'Start a meeting',

  // ---- before anybody sees you ------------------------------------------------------------
  'meet.prejoin_title': 'Ready when you are',
  'meet.prejoin_desc': 'Nobody sees or hears you until you join.',
  'meet.preview_label': 'Your camera',
  'meet.preview_off': 'Your camera is off',
  'meet.mic_level': 'Microphone level',
  'meet.join': 'Join the meeting',
  'meet.joining': 'Joining…',
  'meet.join_to_listen': 'Join to listen',

  // ---- the control bar --------------------------------------------------------------------
  'meet.mic_mute': 'Mute',
  'meet.mic_unmute': 'Unmute',
  'meet.camera_start': 'Turn the camera on',
  'meet.camera_stop': 'Turn the camera off',
  'meet.share_start': 'Share your screen',
  'meet.share_stop': 'Stop sharing',
  'meet.people_toggle': 'People',
  'meet.chat_toggle': 'Meeting chat',
  'meet.devices': 'Camera, microphone and speaker',
  'meet.leave': 'Leave',

  // ---- which camera, which microphone -----------------------------------------------------
  'meet.device_camera': 'Camera',
  'meet.device_microphone': 'Microphone',
  'meet.device_speaker': 'Speaker',
  'meet.device_none': 'Nothing found',
  'meet.device_speaker_fixed': 'This browser always plays through the system speaker.',

  // ---- the stage --------------------------------------------------------------------------
  'meet.stage': 'The people in this meeting',
  'meet.you': 'You',
  'meet.tile_camera_off': 'Camera off',
  'meet.tile_muted': 'Muted',
  'meet.tile_sharing': 'Sharing their screen',
  'meet.people_count': { one: '{n} person', other: '{n} people' },
  'meet.people_title': 'In this meeting',
  'meet.panel_close': 'Close this panel',
  'meet.alone_title': 'You are the only one here',
  'meet.alone_desc': 'Send this link to whoever should be with you.',
  'meet.copy_link': 'Copy the link',
  'meet.link_copied': 'Link copied',

  // ---- the demo ---------------------------------------------------------------------------
  // The one screen in the product that cannot be demonstrated honestly by pretending: a meeting
  // needs a media server, and there is none behind a demo. So it says so, in the tile where the
  // camera would be, rather than drawing an empty square somebody reads as a broken feature.
  'meet.demo_notice': 'A demonstration. Nothing is connected, and no camera or microphone is used.',
  'meet.demo_no_camera': 'No camera in the demo',

  // ---- what is happening to the connection -------------------------------------------------
  'meet.connecting': 'Connecting…',
  'meet.connecting_desc': 'Reaching the media server.',
  'meet.reconnecting': 'Reconnecting…',
  'meet.reconnecting_desc': 'The connection dropped. Everyone stays where they are while it comes back.',
  'meet.ended_title': 'This meeting has ended',
  'meet.ended_desc': 'Everybody has left. Start another one whenever you like.',
  'meet.ended_back': 'Back to your workspace',
  'meet.failed_title': 'The call could not connect',
  'meet.failed_desc':
    'Your network blocked the connection; UDP to this server appears to be closed. Kern falls back to TCP, and a network that allows nothing but web traffic will stop that too.',
  'meet.failed_hint': 'Another network — a phone hotspot, for instance — is the quickest way to tell.',

  // ---- refusals that are not the user's fault ----------------------------------------------
  'meet.not_found_title': 'No such meeting',
  'meet.not_found_desc': 'It has ended, or it belongs to a workspace you are not in.',
  'meet.not_configured_title': 'This instance has no media server',
  'meet.not_configured_desc':
    'Meetings run on LiveKit, which nobody has set up here yet. An administrator adds the secret to .env and starts the container.',
  'meet.not_configured_var': 'The setting that is missing',
  'meet.not_configured_cmd': 'Then start it with',
  'meet.insecure_title': 'A browser gives no camera to an insecure page',
  'meet.insecure_desc':
    'This page arrived over plain HTTP, so the browser refuses the camera and the microphone before Kern is asked for them. Nobody turned a permission down.',
  'meet.insecure_hint':
    'Kern can be installed on a bare IP address with no certificate, and meetings are the one thing that cannot work there. Reach this instance over HTTPS to hold one.',
  'meet.denied_title': 'Kern cannot reach your camera or microphone',
  'meet.denied_desc':
    'The browser is holding the permission back. It is granted per site, so the setting is in this browser rather than in Kern.',
  'meet.denied_step_1': 'Open the site settings from the padlock at the start of the address bar.',
  'meet.denied_step_2': 'Set Camera and Microphone to Allow.',
  'meet.denied_step_3': 'Reload this page.',
  'meet.denied_retry': 'Ask again',
  'meet.no_devices_title': 'No camera or microphone found',
  'meet.no_devices_desc':
    'Nothing is plugged in, or another application is holding it. You can still join and listen.',
  'meet.error_title': 'The meeting could not be opened',

  // ---- the panel that says what it is ------------------------------------------------------
  'meet.chat_title': 'Meeting chat',
  'meet.chat_ephemeral': 'These messages stay in this meeting. Nothing is kept once it ends.',
  'meet.chat_empty': 'Nothing said yet',
  'meet.chat_placeholder': 'Message everybody here',
  'meet.chat_send': 'Send',
}

export const ar: Record<string, Message> = {
  'meet.nav': 'الاجتماعات',
  'meet.title': 'اجتماع',
  'meet.command_start': 'ابدأ اجتماعًا',

  'meet.prejoin_title': 'جاهز متى شئت',
  'meet.prejoin_desc': 'لا أحد يراك أو يسمعك قبل أن تنضم.',
  'meet.preview_label': 'الكاميرا لديك',
  'meet.preview_off': 'الكاميرا لديك مغلقة',
  'meet.mic_level': 'مستوى الميكروفون',
  'meet.join': 'انضم إلى الاجتماع',
  'meet.joining': 'جارٍ الانضمام…',
  'meet.join_to_listen': 'انضم للاستماع',

  'meet.mic_mute': 'اكتم الصوت',
  'meet.mic_unmute': 'ألغِ الكتم',
  'meet.camera_start': 'شغّل الكاميرا',
  'meet.camera_stop': 'أوقف الكاميرا',
  'meet.share_start': 'شارك شاشتك',
  'meet.share_stop': 'أوقف المشاركة',
  'meet.people_toggle': 'الأشخاص',
  'meet.chat_toggle': 'محادثة الاجتماع',
  'meet.devices': 'الكاميرا والميكروفون ومكبر الصوت',
  'meet.leave': 'غادر',

  'meet.device_camera': 'الكاميرا',
  'meet.device_microphone': 'الميكروفون',
  'meet.device_speaker': 'مكبر الصوت',
  'meet.device_none': 'لا يوجد شيء',
  'meet.device_speaker_fixed': 'هذا المتصفح يشغّل الصوت دائمًا عبر مكبر صوت النظام.',

  'meet.stage': 'الأشخاص في هذا الاجتماع',
  'meet.you': 'أنت',
  'meet.tile_camera_off': 'الكاميرا مغلقة',
  'meet.tile_muted': 'مكتوم',
  'meet.tile_sharing': 'يشارك شاشته',
  'meet.people_count': {
    zero: 'لا أحد',
    one: 'شخص واحد',
    two: 'شخصان',
    few: '{n} أشخاص',
    many: '{n} شخصًا',
    other: '{n} شخص',
  },
  'meet.people_title': 'في هذا الاجتماع',
  'meet.panel_close': 'أغلق هذه اللوحة',
  'meet.alone_title': 'أنت وحدك هنا',
  'meet.alone_desc': 'أرسل هذا الرابط إلى من تريد أن ينضم إليك.',
  'meet.copy_link': 'انسخ الرابط',
  'meet.link_copied': 'تم نسخ الرابط',

  'meet.demo_notice': 'عرض توضيحي. لا يوجد أي اتصال، ولا تُستخدم أي كاميرا أو ميكروفون.',
  'meet.demo_no_camera': 'لا كاميرا في العرض التوضيحي',

  'meet.connecting': 'جارٍ الاتصال…',
  'meet.connecting_desc': 'يجري الوصول إلى خادم الوسائط.',
  'meet.reconnecting': 'جارٍ إعادة الاتصال…',
  'meet.reconnecting_desc': 'انقطع الاتصال. يبقى الجميع في أماكنهم حتى يعود.',
  'meet.ended_title': 'انتهى هذا الاجتماع',
  'meet.ended_desc': 'غادر الجميع. ابدأ اجتماعًا آخر متى شئت.',
  'meet.ended_back': 'العودة إلى مساحة العمل',
  'meet.failed_title': 'تعذّر إجراء المكالمة',
  'meet.failed_desc':
    'حجبت شبكتك الاتصال؛ يبدو أن منفذ UDP إلى هذا الخادم مغلق. يلجأ Kern عندها إلى TCP، وشبكة لا تسمح إلا بحركة الويب ستمنع ذلك أيضًا.',
  'meet.failed_hint': 'أسرع طريقة للتأكد هي تجربة شبكة أخرى، مثل نقطة اتصال الهاتف.',

  'meet.not_found_title': 'لا يوجد اجتماع بهذا المعرّف',
  'meet.not_found_desc': 'انتهى الاجتماع، أو أنه يخص مساحة عمل لست فيها.',
  'meet.not_configured_title': 'لا يوجد خادم وسائط في هذا التثبيت',
  'meet.not_configured_desc':
    'تعمل الاجتماعات على LiveKit، ولم يُعدّه أحد هنا بعد. يضيف المسؤول المفتاح السري إلى ملف ‎.env ثم يشغّل الحاوية.',
  'meet.not_configured_var': 'الإعداد الناقص',
  'meet.not_configured_cmd': 'ثم شغّله بـ',
  'meet.insecure_title': 'لا يمنح المتصفح كاميرا لصفحة غير آمنة',
  'meet.insecure_desc':
    'وصلت هذه الصفحة عبر HTTP عادي، فرفض المتصفح الكاميرا والميكروفون قبل أن يطلبهما Kern. لم يرفض أحد أي إذن.',
  'meet.insecure_hint':
    'يمكن تثبيت Kern على عنوان IP مجرّد بلا شهادة، والاجتماعات هي الشيء الوحيد الذي لا يعمل هناك. افتح هذا التثبيت عبر HTTPS لعقد اجتماع.',
  'meet.denied_title': 'لا يستطيع Kern الوصول إلى الكاميرا أو الميكروفون',
  'meet.denied_desc': 'المتصفح يحجب الإذن. يُمنح هذا الإذن لكل موقع على حدة، فالإعداد في المتصفح لا في Kern.',
  'meet.denied_step_1': 'افتح إعدادات الموقع من القفل في بداية شريط العنوان.',
  'meet.denied_step_2': 'اضبط الكاميرا والميكروفون على السماح.',
  'meet.denied_step_3': 'أعد تحميل هذه الصفحة.',
  'meet.denied_retry': 'اطلب الإذن مرة أخرى',
  'meet.no_devices_title': 'لم يُعثر على كاميرا أو ميكروفون',
  'meet.no_devices_desc': 'لا يوجد جهاز موصول، أو يستخدمه تطبيق آخر. يمكنك الانضمام للاستماع فقط.',
  'meet.error_title': 'تعذّر فتح الاجتماع',

  'meet.chat_title': 'محادثة الاجتماع',
  'meet.chat_ephemeral': 'تبقى هذه الرسائل داخل هذا الاجتماع. لا يُحفظ شيء بعد انتهائه.',
  'meet.chat_empty': 'لم يُقل شيء بعد',
  'meet.chat_placeholder': 'اكتب إلى الجميع هنا',
  'meet.chat_send': 'أرسل',
}

export const de: Record<string, Message> = {
  'meet.nav': 'Besprechungen',
  'meet.title': 'Besprechung',
  'meet.command_start': 'Besprechung starten',

  'meet.prejoin_title': 'Bereit, wenn Sie es sind',
  'meet.prejoin_desc': 'Niemand sieht oder hört Sie, bevor Sie beitreten.',
  'meet.preview_label': 'Ihre Kamera',
  'meet.preview_off': 'Ihre Kamera ist aus',
  'meet.mic_level': 'Mikrofonpegel',
  'meet.join': 'Der Besprechung beitreten',
  'meet.joining': 'Tritt bei…',
  'meet.join_to_listen': 'Beitreten und zuhören',

  'meet.mic_mute': 'Stummschalten',
  'meet.mic_unmute': 'Stummschaltung aufheben',
  'meet.camera_start': 'Kamera einschalten',
  'meet.camera_stop': 'Kamera ausschalten',
  'meet.share_start': 'Bildschirm teilen',
  'meet.share_stop': 'Teilen beenden',
  'meet.people_toggle': 'Teilnehmende',
  'meet.chat_toggle': 'Besprechungschat',
  'meet.devices': 'Kamera, Mikrofon und Lautsprecher',
  'meet.leave': 'Verlassen',

  'meet.device_camera': 'Kamera',
  'meet.device_microphone': 'Mikrofon',
  'meet.device_speaker': 'Lautsprecher',
  'meet.device_none': 'Nichts gefunden',
  'meet.device_speaker_fixed': 'Dieser Browser gibt den Ton immer über den Systemlautsprecher aus.',

  'meet.stage': 'Die Teilnehmenden dieser Besprechung',
  'meet.you': 'Sie',
  'meet.tile_camera_off': 'Kamera aus',
  'meet.tile_muted': 'Stumm',
  'meet.tile_sharing': 'Teilt den Bildschirm',
  'meet.people_count': { one: '{n} Person', other: '{n} Personen' },
  'meet.people_title': 'In dieser Besprechung',
  'meet.panel_close': 'Diese Leiste schließen',
  'meet.alone_title': 'Sie sind allein hier',
  'meet.alone_desc': 'Schicken Sie diesen Link an alle, die dabei sein sollen.',
  'meet.copy_link': 'Link kopieren',
  'meet.link_copied': 'Link kopiert',

  'meet.demo_notice': 'Eine Vorführung. Nichts ist verbunden, und weder Kamera noch Mikrofon werden benutzt.',
  'meet.demo_no_camera': 'Keine Kamera in der Vorführung',

  'meet.connecting': 'Verbindung wird aufgebaut…',
  'meet.connecting_desc': 'Der Medienserver wird erreicht.',
  'meet.reconnecting': 'Verbindung wird wiederhergestellt…',
  'meet.reconnecting_desc': 'Die Verbindung ist abgerissen. Alle bleiben, wo sie sind, bis sie zurück ist.',
  'meet.ended_title': 'Diese Besprechung ist beendet',
  'meet.ended_desc': 'Alle haben sie verlassen. Starten Sie jederzeit eine neue.',
  'meet.ended_back': 'Zurück zum Arbeitsbereich',
  'meet.failed_title': 'Die Verbindung kam nicht zustande',
  'meet.failed_desc':
    'Ihr Netzwerk hat die Verbindung blockiert; UDP zu diesem Server scheint gesperrt zu sein. Kern weicht dann auf TCP aus, und ein Netzwerk, das nur Web-Verkehr zulässt, blockiert auch das.',
  'meet.failed_hint': 'Am schnellsten zeigt es ein anderes Netzwerk, etwa der Hotspot eines Telefons.',

  'meet.not_found_title': 'Diese Besprechung gibt es nicht',
  'meet.not_found_desc': 'Sie ist beendet, oder sie gehört zu einem Arbeitsbereich, in dem Sie nicht sind.',
  'meet.not_configured_title': 'Diese Instanz hat keinen Medienserver',
  'meet.not_configured_desc':
    'Besprechungen laufen über LiveKit, das hier noch niemand eingerichtet hat. Eine Administratorin trägt das Geheimnis in .env ein und startet den Container.',
  'meet.not_configured_var': 'Die fehlende Einstellung',
  'meet.not_configured_cmd': 'Dann starten mit',
  'meet.insecure_title': 'Auf einer unsicheren Seite gibt der Browser keine Kamera frei',
  'meet.insecure_desc':
    'Diese Seite kam über einfaches HTTP, also verweigert der Browser Kamera und Mikrofon, bevor Kern überhaupt danach fragt. Niemand hat eine Berechtigung abgelehnt.',
  'meet.insecure_hint':
    'Kern lässt sich ohne Zertifikat auf einer nackten IP-Adresse betreiben; Besprechungen sind das Einzige, was dort nicht geht. Rufen Sie diese Instanz über HTTPS auf, um eine zu halten.',
  'meet.denied_title': 'Kern erreicht Ihre Kamera oder Ihr Mikrofon nicht',
  'meet.denied_desc':
    'Der Browser hält die Berechtigung zurück. Sie wird pro Website vergeben, die Einstellung sitzt also im Browser und nicht in Kern.',
  'meet.denied_step_1': 'Öffnen Sie die Website-Einstellungen über das Schloss am Anfang der Adressleiste.',
  'meet.denied_step_2': 'Stellen Sie Kamera und Mikrofon auf Zulassen.',
  'meet.denied_step_3': 'Laden Sie diese Seite neu.',
  'meet.denied_retry': 'Noch einmal fragen',
  'meet.no_devices_title': 'Keine Kamera und kein Mikrofon gefunden',
  'meet.no_devices_desc':
    'Es ist nichts angeschlossen, oder eine andere Anwendung belegt es. Sie können trotzdem beitreten und zuhören.',
  'meet.error_title': 'Die Besprechung ließ sich nicht öffnen',

  'meet.chat_title': 'Besprechungschat',
  'meet.chat_ephemeral':
    'Diese Nachrichten bleiben in dieser Besprechung. Nach ihrem Ende wird nichts davon aufbewahrt.',
  'meet.chat_empty': 'Noch nichts gesagt',
  'meet.chat_placeholder': 'Nachricht an alle hier',
  'meet.chat_send': 'Senden',
}

export const fa: Record<string, Message> = {
  'meet.nav': 'جلسه‌ها',
  'meet.title': 'جلسه',
  'meet.command_start': 'شروع یک جلسه',

  'meet.prejoin_title': 'هر وقت آماده بودید',
  'meet.prejoin_desc': 'تا وقتی نپیوسته‌اید، کسی شما را نمی‌بیند و نمی‌شنود.',
  'meet.preview_label': 'دوربین شما',
  'meet.preview_off': 'دوربین شما خاموش است',
  'meet.mic_level': 'سطح میکروفون',
  'meet.join': 'پیوستن به جلسه',
  'meet.joining': 'در حال پیوستن…',
  'meet.join_to_listen': 'پیوستن برای شنیدن',

  'meet.mic_mute': 'بی‌صدا کردن',
  'meet.mic_unmute': 'باصدا کردن',
  'meet.camera_start': 'روشن کردن دوربین',
  'meet.camera_stop': 'خاموش کردن دوربین',
  'meet.share_start': 'هم‌رسانی صفحه',
  'meet.share_stop': 'پایان هم‌رسانی',
  'meet.people_toggle': 'افراد',
  'meet.chat_toggle': 'گفت‌وگوی جلسه',
  'meet.devices': 'دوربین، میکروفون و بلندگو',
  'meet.leave': 'خروج',

  'meet.device_camera': 'دوربین',
  'meet.device_microphone': 'میکروفون',
  'meet.device_speaker': 'بلندگو',
  'meet.device_none': 'چیزی پیدا نشد',
  'meet.device_speaker_fixed': 'این مرورگر صدا را همیشه از بلندگوی پیش‌فرض سامانه پخش می‌کند.',

  'meet.stage': 'افراد حاضر در این جلسه',
  'meet.you': 'شما',
  'meet.tile_camera_off': 'دوربین خاموش',
  'meet.tile_muted': 'بی‌صدا',
  'meet.tile_sharing': 'صفحه‌اش را هم‌رسانی می‌کند',
  'meet.people_count': { one: '{n} نفر', other: '{n} نفر' },
  'meet.people_title': 'در این جلسه',
  'meet.panel_close': 'بستن این تابلو',
  'meet.alone_title': 'فقط شما اینجا هستید',
  'meet.alone_desc': 'این پیوند را برای کسی بفرستید که باید کنار شما باشد.',
  'meet.copy_link': 'رونوشت پیوند',
  'meet.link_copied': 'پیوند رونوشت شد',

  'meet.demo_notice': 'یک نمایش است. هیچ اتصالی برقرار نیست و از دوربین و میکروفون استفاده نمی‌شود.',
  'meet.demo_no_camera': 'در نمایش، دوربینی در کار نیست',

  'meet.connecting': 'در حال اتصال…',
  'meet.connecting_desc': 'در حال رسیدن به کارساز رسانه.',
  'meet.reconnecting': 'در حال اتصال دوباره…',
  'meet.reconnecting_desc': 'اتصال قطع شد. تا بازگشتش همه سر جای خود می‌مانند.',
  'meet.ended_title': 'این جلسه به پایان رسید',
  'meet.ended_desc': 'همه بیرون رفته‌اند. هر وقت خواستید جلسه‌ای تازه شروع کنید.',
  'meet.ended_back': 'بازگشت به فضای کاری',
  'meet.failed_title': 'تماس برقرار نشد',
  'meet.failed_desc':
    'شبکهٔ شما اتصال را بست؛ به نظر می‌رسد UDP به این کارساز باز نیست. کِرن آن‌گاه به TCP پناه می‌برد، و شبکه‌ای که جز ترافیک وب چیزی را نمی‌پذیرد جلوی آن را هم می‌گیرد.',
  'meet.failed_hint': 'سریع‌ترین راه آزمودن، شبکه‌ای دیگر است؛ مثلاً نقطهٔ اتصال تلفن.',

  'meet.not_found_title': 'چنین جلسه‌ای نیست',
  'meet.not_found_desc': 'یا به پایان رسیده، یا برای فضای کاری‌ای است که در آن نیستید.',
  'meet.not_configured_title': 'این نصب کارساز رسانه ندارد',
  'meet.not_configured_desc':
    'جلسه‌ها روی LiveKit کار می‌کنند و هنوز کسی آن را اینجا برپا نکرده است. مدیر، رمز را در ‎.env می‌گذارد و بارگنج را روشن می‌کند.',
  'meet.not_configured_var': 'تنظیمی که جا مانده',
  'meet.not_configured_cmd': 'سپس با این فرمان روشنش کنید',
  'meet.insecure_title': 'مرورگر به صفحهٔ ناامن دوربین نمی‌دهد',
  'meet.insecure_desc':
    'این صفحه با HTTP ساده آمده است، پس مرورگر پیش از آنکه کِرن چیزی بخواهد دوربین و میکروفون را رد می‌کند. کسی اجازه‌ای را رد نکرده است.',
  'meet.insecure_hint':
    'کِرن را می‌شود روی یک نشانی IP و بدون گواهی نصب کرد؛ جلسه‌ها تنها چیزی است که آنجا کار نمی‌کند. برای جلسه گرفتن، این نصب را با HTTPS باز کنید.',
  'meet.denied_title': 'کِرن به دوربین یا میکروفون شما نمی‌رسد',
  'meet.denied_desc':
    'مرورگر اجازه را نگه داشته است. این اجازه برای هر پایگاه جداگانه داده می‌شود، پس تنظیمش در مرورگر است نه در کِرن.',
  'meet.denied_step_1': 'تنظیمات پایگاه را از قفل ابتدای نوار نشانی باز کنید.',
  'meet.denied_step_2': 'دوربین و میکروفون را روی «اجازه» بگذارید.',
  'meet.denied_step_3': 'این صفحه را دوباره بارگذاری کنید.',
  'meet.denied_retry': 'دوباره بپرس',
  'meet.no_devices_title': 'دوربین یا میکروفونی پیدا نشد',
  'meet.no_devices_desc':
    'چیزی وصل نیست، یا برنامه‌ای دیگر آن را در دست دارد. باز هم می‌توانید بپیوندید و بشنوید.',
  'meet.error_title': 'جلسه باز نشد',

  'meet.chat_title': 'گفت‌وگوی جلسه',
  'meet.chat_ephemeral': 'این پیام‌ها در همین جلسه می‌مانند. با پایان جلسه چیزی نگه داشته نمی‌شود.',
  'meet.chat_empty': 'هنوز چیزی گفته نشده',
  'meet.chat_placeholder': 'به همهٔ حاضران بنویسید',
  'meet.chat_send': 'بفرست',
}

export const tr: Record<string, Message> = {
  'meet.nav': 'Toplantılar',
  'meet.title': 'Toplantı',
  'meet.command_start': 'Toplantı başlat',

  'meet.prejoin_title': 'Hazır olduğunuzda',
  'meet.prejoin_desc': 'Katılmadan önce sizi kimse görmez, kimse duymaz.',
  'meet.preview_label': 'Kameranız',
  'meet.preview_off': 'Kameranız kapalı',
  'meet.mic_level': 'Mikrofon düzeyi',
  'meet.join': 'Toplantıya katıl',
  'meet.joining': 'Katılınıyor…',
  'meet.join_to_listen': 'Dinlemek için katıl',

  'meet.mic_mute': 'Sesi kapat',
  'meet.mic_unmute': 'Sesi aç',
  'meet.camera_start': 'Kamerayı aç',
  'meet.camera_stop': 'Kamerayı kapat',
  'meet.share_start': 'Ekranınızı paylaşın',
  'meet.share_stop': 'Paylaşımı durdur',
  'meet.people_toggle': 'Kişiler',
  'meet.chat_toggle': 'Toplantı sohbeti',
  'meet.devices': 'Kamera, mikrofon ve hoparlör',
  'meet.leave': 'Ayrıl',

  'meet.device_camera': 'Kamera',
  'meet.device_microphone': 'Mikrofon',
  'meet.device_speaker': 'Hoparlör',
  'meet.device_none': 'Hiçbir şey bulunamadı',
  'meet.device_speaker_fixed': 'Bu tarayıcı sesi her zaman sistem hoparlöründen verir.',

  'meet.stage': 'Bu toplantıdaki kişiler',
  'meet.you': 'Siz',
  'meet.tile_camera_off': 'Kamera kapalı',
  'meet.tile_muted': 'Sessiz',
  'meet.tile_sharing': 'Ekranını paylaşıyor',
  'meet.people_count': { one: '{n} kişi', other: '{n} kişi' },
  'meet.people_title': 'Bu toplantıda',
  'meet.panel_close': 'Bu paneli kapat',
  'meet.alone_title': 'Burada yalnızsınız',
  'meet.alone_desc': 'Yanınızda olması gerekenlere bu bağlantıyı gönderin.',
  'meet.copy_link': 'Bağlantıyı kopyala',
  'meet.link_copied': 'Bağlantı kopyalandı',

  'meet.demo_notice': 'Bir tanıtım. Hiçbir bağlantı kurulmaz, kamera ve mikrofon kullanılmaz.',
  'meet.demo_no_camera': 'Tanıtımda kamera yok',

  'meet.connecting': 'Bağlanılıyor…',
  'meet.connecting_desc': 'Ortam sunucusuna ulaşılıyor.',
  'meet.reconnecting': 'Yeniden bağlanılıyor…',
  'meet.reconnecting_desc': 'Bağlantı koptu. Geri gelene kadar herkes yerinde kalır.',
  'meet.ended_title': 'Bu toplantı bitti',
  'meet.ended_desc': 'Herkes ayrıldı. İstediğiniz zaman yenisini başlatın.',
  'meet.ended_back': 'Çalışma alanına dön',
  'meet.failed_title': 'Görüşme bağlanamadı',
  'meet.failed_desc':
    'Ağınız bağlantıyı engelledi; bu sunucuya UDP kapalı görünüyor. Kern bunun üzerine TCP’ye düşer ve yalnızca web trafiğine izin veren bir ağ onu da keser.',
  'meet.failed_hint': 'En hızlı denemesi başka bir ağdır; örneğin bir telefonun etkin noktası.',

  'meet.not_found_title': 'Böyle bir toplantı yok',
  'meet.not_found_desc': 'Ya bitti ya da içinde olmadığınız bir çalışma alanına ait.',
  'meet.not_configured_title': 'Bu kurulumda ortam sunucusu yok',
  'meet.not_configured_desc':
    'Toplantılar LiveKit üzerinde çalışır ve burada henüz kimse onu kurmadı. Bir yönetici gizli anahtarı .env dosyasına yazar ve kapsayıcıyı başlatır.',
  'meet.not_configured_var': 'Eksik olan ayar',
  'meet.not_configured_cmd': 'Sonra şununla başlatın',
  'meet.insecure_title': 'Tarayıcı güvensiz bir sayfaya kamera vermez',
  'meet.insecure_desc':
    'Bu sayfa düz HTTP ile geldi; tarayıcı, Kern istemeden önce kamerayı ve mikrofonu reddediyor. Kimse bir izni geri çevirmedi.',
  'meet.insecure_hint':
    'Kern sertifikasız, çıplak bir IP adresine kurulabilir; orada çalışmayan tek şey toplantılardır. Toplantı yapmak için bu kuruluma HTTPS ile ulaşın.',
  'meet.denied_title': 'Kern kameranıza veya mikrofonunuza erişemiyor',
  'meet.denied_desc':
    'İzni tarayıcı tutuyor. Bu izin her site için ayrı verilir, yani ayar Kern’de değil tarayıcıdadır.',
  'meet.denied_step_1': 'Adres çubuğunun başındaki kilitten site ayarlarını açın.',
  'meet.denied_step_2': 'Kamera ve Mikrofon için İzin ver seçin.',
  'meet.denied_step_3': 'Bu sayfayı yeniden yükleyin.',
  'meet.denied_retry': 'Yeniden sor',
  'meet.no_devices_title': 'Kamera veya mikrofon bulunamadı',
  'meet.no_devices_desc':
    'Takılı bir aygıt yok ya da başka bir uygulama onu kullanıyor. Yine de katılıp dinleyebilirsiniz.',
  'meet.error_title': 'Toplantı açılamadı',

  'meet.chat_title': 'Toplantı sohbeti',
  'meet.chat_ephemeral': 'Bu iletiler bu toplantıda kalır. Toplantı bitince hiçbiri saklanmaz.',
  'meet.chat_empty': 'Henüz bir şey söylenmedi',
  'meet.chat_placeholder': 'Buradaki herkese yazın',
  'meet.chat_send': 'Gönder',
}

/**
 * What the shell merges into the message runtime when it registers this module.
 *
 * Thunks, so a locale is fetched only when it is the one in use; English is the fallback and is
 * therefore always loaded.
 */
export const meetMessageBundles = {
  ar: async () => ar,
  de: async () => de,
  en: async () => en,
  fa: async () => fa,
  tr: async () => tr,
}

export type MeetMessageKey = keyof typeof en
