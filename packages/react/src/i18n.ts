/**
 * Overlay language. The host sets `locale` on init or page config. Missing or
 * unknown values stay English so other projects are unchanged.
 */

export type SnagLocale = "en" | "ar";
export type SnagDirection = "ltr" | "rtl";

const en = {
  "tab.open": "What's on your mind?",
  "tab.aria": "Snag: request a change on this screen",
  "tab.ariaEnv": "Snag ({env}): request a change on this screen",
  "tab.awaitingReply": "{count} awaiting your reply",
  "tab.finished.one": "{count} request finished",
  "tab.finished.other": "{count} requests finished",
  "tab.inProgress": "A request is in progress",

  "nav.new": "New request",
  "nav.requests": "Requests",
  "nav.snag": "Snag",
  "nav.close": "Close",
  "nav.changeRequest": "CHANGE REQUEST",

  "composer.placeholder": "What should change on this screen?",
  "composer.go": "Go",
  "composer.includeScreenshot": "Include screenshot with request",
  "composer.pick": "Select elements",
  "composer.pickEdit": "Edit elements",
  "composer.markup": "Mark up",
  "composer.markupEdit": "Marked up · Edit",
  "composer.markupAria": "Mark up screenshot",
  "composer.screenshotAlt": "Screenshot preview",
  "composer.recentSteps": "Recent steps",
  "composer.howYouGotHere": "HOW YOU GOT HERE",
  "composer.selectedElements": "Selected elements",
  "composer.opened": "Opened",
  "composer.removeStep": "Remove step {number}",
  "composer.aria": "Snag change request",

  "submit.reading": "Reading this screen…",
  "submit.analyzing": "Analyzing the request…",
  "submit.magic": "Doing the magic",
  "submit.needDescription": "Describe the change first.",
  "submit.tooLarge": "Attachments are too large. Remove an image and try again.",
  "submit.failed": "Request failed",
  "submit.donePlan": "Request submitted. The agent plans the change first.",
  "submit.doneWork": "Request submitted. An agent is working on it.",
  "submit.followupsHint": "If anything is unclear you'll get questions here. ",
  "submit.executeHint":
    "Depending on the change, a developer may check it first, or you may be asked to try a preview before it goes live. Progress shows on the request card.",
  "submit.openAgent": "Open agent",
  "submit.track": "Track this request",
  "submit.viewRequests": "View requests",
  "submit.notifyBody":
    "Get a browser notification when the agent has a question or your change is ready, even in another tab.",
  "submit.notify": "Notify me when it's ready",
  "submit.notNow": "Not now",

  "list.needsYou": "Needs you",
  "list.mine": "Mine",
  "list.loading": "Loading requests",
  "list.showAll": "Show all requests",
  "list.emptyCaughtUpTitle": "You're all caught up",
  "list.emptyCaughtUp": "Nothing needs you right now.",
  "list.emptyNeedsYouTitle": "You're all caught up",
  "list.emptyNeedsYou": "Nothing needs a reply right now. Turn off Needs you to see every request.",
  "list.emptyMineTitle": "No requests from you yet",
  "list.emptyMine": "Share what's on your mind and you can follow it here.",
  "list.emptyTitle": "No requests yet",
  "list.empty": "Share what's on your mind from any screen and track it here.",
  "list.refresh": "Refresh",
  "list.refreshAria": "Refresh requests",
  "list.updated": "Requests updated",
  "list.showLess": "Show less",
  "list.showMore": "Show more",
  "list.progress": "Progress",
  "list.reload": "Reload to see it",
  "list.reloadHint": "It can take a minute or two to go live after merging.",
  "list.openPr": "Open pull request",
  "list.openAgent": "Open agent",
  "list.handoff": "A developer will take it from here. {reason}",
  "list.followUpTo": "Follow-up to",
  "list.earlierRequest": "an earlier request",

  "status.queued": "QUEUED",
  "status.running": "IN PROGRESS",
  "status.needs_input": "NEEDS YOUR REPLY",
  "status.awaiting_requester": "REVIEW THE PLAN",
  "status.awaiting_approval": "WAITING FOR A DEVELOPER",
  "status.awaiting_review": "IN DEVELOPER REVIEW",
  "status.awaiting_confirmation": "READY FOR YOU TO CHECK",
  "status.finished": "FINISHED",
  "status.merged": "LIVE",
  "status.error": "ERROR",
  "status.rejected": "NOT APPROVED",
  "status.blocked": "BLOCKED",
  "status.closed_by_requester": "CLOSED",
  "status.closedByYou": "CLOSED BY YOU",

  "phase.planning": "Planning",
  "phase.implementing": "Building",
  "phase.delivering": "Delivering",
  "stage.planning": "Planning",
  "stage.building": "Building",
  "stage.waitingPreview": "Waiting for preview",
  "stage.waitingChecks": "Waiting for checks",

  "block.message": "Snag stopped this request because it would change protected files.",
  "block.rule": "Rule: {rules}",
  "block.rulePrefix": "Rule:",
  "block.next": "Ask for the change without touching these files, or contact your project admin.",
  "block.followupHint": "Describe a version of the change that leaves the protected files as they are.",
  "reject.withNote": "A developer decided not to make this change: {note}",
  "reject.withoutNote":
    "A developer decided not to make this change. File a new request if it is still needed.",

  "reply.placeholder": "Answer the questions above…",
  "reply.send": "Send reply",
  "reply.sending": "Sending…",
  "reply.empty": "Write a reply or attach an image or file.",
  "reply.failed": "Reply failed",
  "reply.ownWords": "Reply in your own words",
  "reply.other": "Other",
  "reply.yourAnswer": "Your answer…",
  "reply.sendAnswer": "Send answer",
  "reply.sendAnswers": "Send answers ({answered}/{total})",

  "confirm.placeholder": "What should be different?",
  "confirm.send": "Send feedback",
  "confirm.sending": "Sending…",
  "confirm.looksRight": "Looks right",
  "confirm.confirming": "Confirming…",
  "confirm.empty": "Describe what is not right, or attach an image or file.",
  "confirm.failed": "Something went wrong",

  "plan.placeholder": "What should be different?",
  "plan.send": "Send changes",
  "plan.sending": "Sending…",
  "plan.approve": "Looks right, build it",
  "plan.approving": "Approving…",
  "plan.empty": "Describe the change or attach an image or file.",
  "plan.failed": "Something went wrong",
  "plan.heading": "Here's what the agent plans to change",
  "plan.disclaimer":
    "Nothing is built until you approve. A developer may still check it before it goes live.",
  "plan.preview": "Show me the expected result",
  "plan.adjust": "Adjust",
  "plan.cancel": "Cancel",

  "close.you": "You closed this request.",
  "close.requester": "The requester closed this request.",
  "close.noteLabel": "Note for the developer",
  "close.notePlaceholder": "Add a note for the developer (optional)",
  "close.submit": "Close request",
  "close.closing": "Closing…",
  "close.failed": "Could not close the request",
  "close.body.inProgress":
    "Snag will stop following this request. If an agent is already working, it may finish in the background, but the result will not be merged or sent on for review.",
  "close.body.needsYou": "You will not need to reply, and nothing further will be built from this request.",
  "close.body.waitingDeveloper":
    "A developer will no longer be asked to approve this, and nothing further will be built from it.",
  "close.body.default": "Snag will stop following this request.",
  "close.body.awaitingReview": "A developer will no longer be asked to review this.",
  "close.body.awaitingConfirmation": "Snag will not merge this change.",
  "close.prStays": " An open pull request stays open until someone closes it on the repository.",
  "close.nothingFurther": " Nothing further will be built from it.",
  "close.confirmTitle": "Close this request?",
  "close.keepOpen": "Keep it open",

  "followup.placeholder": "What should we change next?",
  "followup.submit": "Start follow-up",
  "followup.title": "Continue this request",
  "followup.cancel": "Cancel",
  "followup.continueNew": "Continue in a new request",
  "followup.starting": "Starting…",
  "followup.empty": "Write what should change, or attach an image or file.",
  "followup.failed": "Could not start the follow-up",
  "followup.hint.merged":
    "This change is already live. Your note starts a new request and brings this context with it.",
  "followup.hint.finished":
    "This request is finished. Your note starts a new request and brings this context with it.",
  "followup.hint.error":
    "Say what you still want. Your note starts a new request and brings this context with it.",
  "followup.hint.rejected":
    "Say what should be different. Your note starts a new request and brings this context with it.",
  "followup.hint.inProgress":
    "This request is still in progress. A follow-up starts a separate request and leaves this one alone.",
  "followup.hint.default": "Your note starts a new request and brings this context with it.",

  "picker.aria": "Select an element",
  "picker.tap": "Tap an element, then Add",
  "picker.click": "Click the elements to change",
  "picker.parent": "Parent",
  "picker.add": "Add",
  "picker.remove": "Remove",
  "picker.cancel": "Cancel",
  "picker.done": "Done",
  "picker.doneCount": "Done ({count})",
  "picker.max": "Up to {max} elements",
  "picker.hint": "Click again to remove · ↑ ↓ parent / child · Enter done · Esc cancel",

  "annotate.aria": "Annotate screenshot",
  "annotate.cancel": "Cancel annotation",
  "annotate.title": "Mark up screenshot",
  "annotate.pen": "Pen",
  "annotate.cancelAction": "Cancel",
  "annotate.highlighter": "Highlighter",
  "annotate.undo": "Undo",
  "annotate.clear": "Clear",
  "annotate.alt": "Screenshot to annotate",
  "annotate.saving": "Saving…",
  "annotate.done": "Done",
  "annotate.loadFailed": "Failed to load screenshot for annotation",

  "attach.add": "Add image or file",
  "attach.only": "See the attached reference.",
  "attach.readFailed": "Could not read that image.",
  "attach.tooLarge": "{name} is too large.",
  "attach.unsupported":
    "{name} isn't supported. Use an image, PDF, Word, Excel, PowerPoint, or a text file.",
  "attach.maxImages": "You can attach up to {max} images.",
  "attach.maxFiles": "You can attach up to {max} files.",
  "attach.imageTooLarge": "{name} is too large. Try a smaller image.",
  "attach.readFailedName": "Couldn't read {name}.",
  "attach.password": "{name} is password-protected.",
  "attach.noText":
    "{name} has no text we can read. If it is a scan, attach a picture of it instead.",
  "attach.empty": "{name} is empty.",
  "attach.remove": "Remove {name}",

  "toast.view": "View",
  "toast.reload": "Reload page",
  "toast.dismiss": "Dismiss",
  "toast.needs_input": "The agent has a question for you",
  "toast.awaiting_requester": "The plan is ready for you to review",
  "toast.awaiting_confirmation": "Your change is ready to check",
  "toast.finished": "Your request is finished",
  "toast.merged": "Your change is live",
  "toast.error": "Your request hit a problem",
  "toast.rejected": "A developer declined your request",
  "toast.blocked": "This request was blocked",

  "preview.missing": "Couldn't find these elements on this screen.",
  "preview.disclaimer": "The real change may look a little different.",
  "preview.title": "Approximate preview",
  "preview.partial":
    "Some parts of the plan aren't on this screen. The real change may look a little different.",
  "preview.close": "Close",
  "preview.back": "Back to plan",

  "marker.aria": "Open request {number}: {prompt}",

  "error.notInitialized": "Snag is not initialized",
  "error.requestFailed": "Request failed ({status})",
  "error.replyFailed": "Reply failed ({status})",
  "error.confirmFailed": "Confirmation failed ({status})",
  "error.closeFailed": "Could not close the request ({status})",

  "handoff.rulesChanged": "New commits on the pull request no longer pass the rules.",
  "handoff.noPr": "The agent finished without opening a pull request.",
  "handoff.noPreview": "No preview deployment was found for this pull request.",
  "handoff.ciTimeout": "CI did not finish within 60 minutes.",
  "handoff.ciFailed": "CI failed on the pull request.",
  "handoff.noChecks":
    "The repository reports no CI checks for this pull request, so Snag will not merge it automatically.",
  "handoff.conflicts": "The pull request has merge conflicts.",
  "handoff.dailyLimit": "Daily automatic merge limit reached.",
  "handoff.mergeFailed": "Snag could not merge the pull request.",
  "handoff.deliveryChanged": "Delivery setting changed; a developer needs to merge this PR.",
  "handoff.unreachable": "Snag cannot reach the pull request on {host}.",
  "handoff.authFailed": "Snag could not authenticate to {host}.",
  "handoff.hostDidNotMerge": "{host} did not merge the pull request.",
  "handoff.hostRefused":
    "{host} refused the merge (branch protection, conflicts, or token permissions).",
  "handoff.readFailed": "Snag could not read the pull request from {host}.",
  "handoff.checkFailed": "Snag could not check the pull request.",
} as const;

export type MessageKey = keyof typeof en;

const ar: Record<MessageKey, string> = {
  "tab.open": "ما الذي يدور في ذهنك؟",
  "tab.aria": "Snag: اطلب تغييرًا على هذه الشاشة",
  "tab.ariaEnv": "Snag ({env}): اطلب تغييرًا على هذه الشاشة",
  "tab.awaitingReply": "{count} بانتظار ردك",
  "tab.finished.one": "اكتمل طلب واحد",
  "tab.finished.other": "اكتملت {count} طلبات",
  "tab.inProgress": "هناك طلب قيد التنفيذ",

  "nav.new": "طلب جديد",
  "nav.requests": "الطلبات",
  "nav.snag": "Snag",
  "nav.close": "إغلاق",
  "nav.changeRequest": "طلب التغيير",

  "composer.placeholder": "ما الذي يجب أن يتغيّر في هذه الشاشة؟",
  "composer.go": "إرسال",
  "composer.includeScreenshot": "إرفاق لقطة الشاشة مع الطلب",
  "composer.pick": "حدّد عناصر",
  "composer.pickEdit": "عدّل العناصر",
  "composer.markup": "تمييز",
  "composer.markupEdit": "مميّز · تعديل",
  "composer.markupAria": "تمييز لقطة الشاشة",
  "composer.screenshotAlt": "معاينة لقطة الشاشة",
  "composer.recentSteps": "الخطوات الأخيرة",
  "composer.howYouGotHere": "كيف وصلت إلى هنا",
  "composer.selectedElements": "العناصر المحددة",
  "composer.opened": "فُتحت",
  "composer.removeStep": "إزالة الخطوة {number}",
  "composer.aria": "طلب تغيير عبر Snag",

  "submit.reading": "جارٍ قراءة هذه الشاشة…",
  "submit.analyzing": "جارٍ تحليل الطلب…",
  "submit.magic": "جارٍ التنفيذ",
  "submit.needDescription": "صف التغيير أولًا.",
  "submit.tooLarge": "المرفقات كبيرة جدًا. احذف صورة ثم أعد المحاولة.",
  "submit.failed": "فشل إرسال الطلب",
  "submit.donePlan": "تم إرسال الطلب. يضع الوكيل الخطة أولًا.",
  "submit.doneWork": "تم إرسال الطلب. يعمل وكيل على تنفيذه.",
  "submit.followupsHint": "إذا كان أي شيء غير واضح، ستصلك أسئلة هنا. ",
  "submit.executeHint":
    "بحسب التغيير، قد يراجعه مطوّر أولًا، أو يُطلب منك تجربة معاينة قبل أن يصبح منشورًا. يظهر التقدّم على بطاقة الطلب.",
  "submit.openAgent": "فتح الوكيل",
  "submit.track": "متابعة هذا الطلب",
  "submit.viewRequests": "عرض الطلبات",
  "submit.notifyBody":
    "احصل على إشعار في المتصفح عندما يكون لدى الوكيل سؤال أو عندما يصبح التغيير جاهزًا، حتى وأنت في تبويب آخر.",
  "submit.notify": "أعلِمني عندما يصبح جاهزًا",
  "submit.notNow": "ليس الآن",

  "list.needsYou": "بانتظارك",
  "list.mine": "طلباتي",
  "list.loading": "جارٍ تحميل الطلبات",
  "list.showAll": "عرض كل الطلبات",
  "list.emptyCaughtUpTitle": "لا شيء بانتظارك",
  "list.emptyCaughtUp": "لا يوجد طلب يحتاجك الآن.",
  "list.emptyNeedsYouTitle": "لا شيء بانتظارك",
  "list.emptyNeedsYou": "لا يوجد طلب يحتاج ردًا الآن. أوقف «بانتظارك» لعرض كل الطلبات.",
  "list.emptyMineTitle": "لا توجد طلبات منك بعد",
  "list.emptyMine": "شارك ما يدور في ذهنك وستتمكن من متابعته هنا.",
  "list.emptyTitle": "لا توجد طلبات بعد",
  "list.empty": "شارك ما يدور في ذهنك من أي شاشة وتابعه من هنا.",
  "list.refresh": "تحديث",
  "list.refreshAria": "تحديث الطلبات",
  "list.updated": "تم تحديث الطلبات",
  "list.showLess": "عرض أقل",
  "list.showMore": "عرض المزيد",
  "list.progress": "التقدّم",
  "list.reload": "أعد التحميل لرؤيته",
  "list.reloadHint": "قد يستغرق الأمر دقيقة أو دقيقتين حتى يظهر منشورًا بعد الدمج.",
  "list.openPr": "فتح طلب الدمج (PR)",
  "list.openAgent": "فتح الوكيل",
  "list.handoff": "سيتولى مطوّر الأمر من هنا. {reason}",
  "list.followUpTo": "متابعة لـ",
  "list.earlierRequest": "طلب سابق",

  "status.queued": "في الانتظار",
  "status.running": "قيد التنفيذ",
  "status.needs_input": "يحتاج ردك",
  "status.awaiting_requester": "راجع الخطة",
  "status.awaiting_approval": "بانتظار مطوّر",
  "status.awaiting_review": "قيد مراجعة المطوّر",
  "status.awaiting_confirmation": "جاهز للتجربة",
  "status.finished": "اكتمل",
  "status.merged": "منشور",
  "status.error": "خطأ",
  "status.rejected": "لم تتم الموافقة",
  "status.blocked": "محظور",
  "status.closed_by_requester": "مغلق",
  "status.closedByYou": "أغلقته أنت",

  "phase.planning": "التخطيط",
  "phase.implementing": "البناء",
  "phase.delivering": "التسليم",
  "stage.planning": "التخطيط",
  "stage.building": "البناء",
  "stage.waitingPreview": "بانتظار المعاينة",
  "stage.waitingChecks": "بانتظار الفحوصات",

  "block.message": "أوقف Snag هذا الطلب لأنه سيغيّر ملفات محمية لا يُسمح بتعديلها.",
  "block.rule": "القاعدة: {rules}",
  "block.rulePrefix": "القاعدة:",
  "block.next": "اطلب التغيير بدون المساس بهذه الملفات، أو تواصل مع مسؤول المشروع.",
  "block.followupHint": "صِف التغيير بطريقة لا تمسّ الملفات المحمية.",
  "reject.withNote": "قرّر أحد المطوّرين عدم تنفيذ هذا التغيير: {note}",
  "reject.withoutNote":
    "قرّر أحد المطوّرين عدم تنفيذ هذا التغيير. أنشئ طلبًا جديدًا إذا كنت لا تزال تحتاجه.",

  "reply.placeholder": "أجب عن الأسئلة أعلاه…",
  "reply.send": "إرسال الرد",
  "reply.sending": "جارٍ الإرسال…",
  "reply.empty": "اكتب ردًا أو أرفق صورة أو ملفًا.",
  "reply.failed": "فشل إرسال الرد",
  "reply.ownWords": "الرد بكلماتك",
  "reply.other": "أخرى",
  "reply.yourAnswer": "إجابتك…",
  "reply.sendAnswer": "إرسال الإجابة",
  "reply.sendAnswers": "إرسال الإجابات ({answered}/{total})",

  "confirm.placeholder": "ما الذي يجب أن يختلف؟",
  "confirm.send": "إرسال الملاحظات",
  "confirm.sending": "جارٍ الإرسال…",
  "confirm.looksRight": "يبدو صحيحًا",
  "confirm.confirming": "جارٍ التأكيد…",
  "confirm.empty": "صف ما هو غير صحيح، أو أرفق صورة أو ملفًا.",
  "confirm.failed": "حدث خطأ ما",

  "plan.placeholder": "ما الذي يجب أن يختلف؟",
  "plan.send": "إرسال التعديلات",
  "plan.sending": "جارٍ الإرسال…",
  "plan.approve": "يبدو صحيحًا، نفّذه",
  "plan.approving": "جارٍ الموافقة…",
  "plan.empty": "صف التغيير أو أرفق صورة أو ملفًا.",
  "plan.failed": "حدث خطأ ما",
  "plan.heading": "هذا ما يخطط الوكيل لتغييره",
  "plan.disclaimer":
    "لن يُبنى شيء حتى توافق. قد يراجعه مطوّر قبل أن يصبح منشورًا.",
  "plan.preview": "أرني النتيجة المتوقعة",
  "plan.adjust": "تعديل",
  "plan.cancel": "إلغاء",

  "close.you": "أغلقت هذا الطلب.",
  "close.requester": "أغلق مقدّم الطلب هذا الطلب.",
  "close.noteLabel": "ملاحظة للمطوّر",
  "close.notePlaceholder": "أضف ملاحظة للمطوّر (اختياري)",
  "close.submit": "إغلاق الطلب",
  "close.closing": "جارٍ الإغلاق…",
  "close.failed": "تعذّر إغلاق الطلب",
  "close.body.inProgress":
    "سيتوقف Snag عن متابعة هذا الطلب. إذا كان وكيل يعمل بالفعل فقد يُكمل في الخلفية، لكن النتيجة لن تُدمج ولن تُرسل للمراجعة.",
  "close.body.needsYou": "لن تحتاج إلى الرد، ولن يُبنى شيء آخر من هذا الطلب.",
  "close.body.waitingDeveloper": "لن يُطلب من مطوّر الموافقة على هذا، ولن يُبنى شيء آخر منه.",
  "close.body.default": "سيتوقف Snag عن متابعة هذا الطلب.",
  "close.body.awaitingReview": "لن يُطلب من مطوّر مراجعة هذا.",
  "close.body.awaitingConfirmation": "لن يدمج Snag هذا التغيير.",
  "close.prStays": " يبقى طلب الدمج (PR) المفتوح مفتوحًا حتى يغلقه أحد في المستودع.",
  "close.nothingFurther": " لن يُبنى شيء آخر منه.",
  "close.confirmTitle": "إغلاق هذا الطلب؟",
  "close.keepOpen": "الإبقاء عليه مفتوحًا",

  "followup.placeholder": "ما الذي نغيّره بعد ذلك؟",
  "followup.submit": "بدء متابعة",
  "followup.title": "متابعة هذا الطلب",
  "followup.cancel": "إلغاء",
  "followup.continueNew": "متابعة في طلب جديد",
  "followup.starting": "جارٍ البدء…",
  "followup.empty": "اكتب ما يجب أن يتغيّر، أو أرفق صورة أو ملفًا.",
  "followup.failed": "تعذّر بدء المتابعة",
  "followup.hint.merged":
    "هذا التغيير منشور بالفعل. ملاحظتك تبدأ طلبًا جديدًا وتنقل هذا السياق معه.",
  "followup.hint.finished": "اكتمل هذا الطلب. ملاحظتك تبدأ طلبًا جديدًا وتنقل هذا السياق معه.",
  "followup.hint.error": "قل ما تريده بعد. ملاحظتك تبدأ طلبًا جديدًا وتنقل هذا السياق معه.",
  "followup.hint.rejected":
    "قل ما يجب أن يختلف. ملاحظتك تبدأ طلبًا جديدًا وتنقل هذا السياق معه.",
  "followup.hint.inProgress":
    "هذا الطلب لا يزال قيد التنفيذ. المتابعة تبدأ طلبًا منفصلًا وتترك هذا كما هو.",
  "followup.hint.default": "ملاحظتك تبدأ طلبًا جديدًا وتنقل هذا السياق معه.",

  "picker.aria": "حدّد عنصرًا",
  "picker.tap": "المس عنصرًا ثم أضفه",
  "picker.click": "انقر العناصر المطلوب تغييرها",
  "picker.parent": "العنصر الأب",
  "picker.add": "إضافة",
  "picker.remove": "إزالة",
  "picker.cancel": "إلغاء",
  "picker.done": "تم",
  "picker.doneCount": "تم ({count})",
  "picker.max": "حتى {max} عناصر",
  "picker.hint": "انقر مرة أخرى للإزالة · ↑ ↓ الأب / الابن · Enter تم · Esc إلغاء",

  "annotate.aria": "تمييز لقطة الشاشة",
  "annotate.cancel": "إلغاء التمييز",
  "annotate.title": "تمييز لقطة الشاشة",
  "annotate.pen": "قلم",
  "annotate.cancelAction": "إلغاء",
  "annotate.highlighter": "قلم تمييز",
  "annotate.undo": "تراجع",
  "annotate.clear": "مسح",
  "annotate.alt": "لقطة شاشة للتمييز",
  "annotate.saving": "جارٍ الحفظ…",
  "annotate.done": "تم",
  "annotate.loadFailed": "تعذّر تحميل لقطة الشاشة للتمييز",

  "attach.add": "إضافة صورة أو ملف",
  "attach.only": "انظر المرجع المرفق.",
  "attach.readFailed": "تعذّر قراءة هذه الصورة.",
  "attach.tooLarge": "{name} كبير جدًا.",
  "attach.unsupported":
    "{name} غير مدعوم. استخدم صورة، أو PDF، أو Word، أو Excel، أو PowerPoint، أو ملف نصي.",
  "attach.maxImages": "يمكنك إرفاق حتى {max} صور.",
  "attach.maxFiles": "يمكنك إرفاق حتى {max} ملفات.",
  "attach.imageTooLarge": "{name} كبير جدًا. جرّب صورة أصغر.",
  "attach.readFailedName": "تعذّر قراءة {name}.",
  "attach.password": "{name} محمي بكلمة مرور.",
  "attach.noText":
    "{name} لا يحتوي نصًا يمكن قراءته. إذا كان مسحًا ضوئيًا، أرفق صورة منه بدلًا من ذلك.",
  "attach.empty": "{name} فارغ.",
  "attach.remove": "إزالة {name}",

  "toast.view": "عرض",
  "toast.reload": "إعادة تحميل الصفحة",
  "toast.dismiss": "إخفاء",
  "toast.needs_input": "لدى الوكيل سؤال لك",
  "toast.awaiting_requester": "الخطة جاهزة لمراجعتك",
  "toast.awaiting_confirmation": "تغييرك جاهز للتجربة",
  "toast.finished": "اكتمل طلبك",
  "toast.merged": "تغييرك منشور الآن",
  "toast.error": "واجه طلبك مشكلة",
  "toast.rejected": "رفض مطوّر طلبك",
  "toast.blocked": "تم حظر هذا الطلب",

  "preview.missing": "تعذّر العثور على هذه العناصر في هذه الشاشة.",
  "preview.disclaimer": "قد يبدو التغيير الفعلي مختلفًا قليلًا.",
  "preview.title": "معاينة تقريبية",
  "preview.partial":
    "بعض أجزاء الخطة ليست على هذه الشاشة. قد يبدو التغيير الفعلي مختلفًا قليلًا.",
  "preview.close": "إغلاق",
  "preview.back": "العودة إلى الخطة",

  "marker.aria": "فتح الطلب {number}: {prompt}",

  "error.notInitialized": "لم يتم تهيئة Snag",
  "error.requestFailed": "فشل الطلب ({status})",
  "error.replyFailed": "فشل الرد ({status})",
  "error.confirmFailed": "فشل التأكيد ({status})",
  "error.closeFailed": "تعذّر إغلاق الطلب ({status})",

  "handoff.rulesChanged": "الالتزامات الجديدة على طلب الدمج (PR) لم تعد تستوفي القواعد.",
  "handoff.noPr": "أنهى الوكيل العمل دون فتح طلب دمج (PR).",
  "handoff.noPreview": "لم يُعثر على معاينة لهذا الطلب.",
  "handoff.ciTimeout": "لم تكتمل فحوصات CI خلال 60 دقيقة.",
  "handoff.ciFailed": "فشلت فحوصات CI على طلب الدمج (PR).",
  "handoff.noChecks":
    "المستودع لا يبلّغ عن فحوصات CI لهذا الطلب، لذلك لن يدمجه Snag تلقائيًا.",
  "handoff.conflicts": "طلب الدمج (PR) فيه تعارضات.",
  "handoff.dailyLimit": "تم بلوغ حد الدمج التلقائي اليومي.",
  "handoff.mergeFailed": "تعذّر على Snag دمج طلب الدمج (PR).",
  "handoff.deliveryChanged": "تغيّر إعداد التسليم؛ يحتاج مطوّر إلى دمج هذا الطلب (PR).",
  "handoff.unreachable": "لا يستطيع Snag الوصول إلى طلب الدمج (PR) على {host}.",
  "handoff.authFailed": "تعذّر على Snag المصادقة على {host}.",
  "handoff.hostDidNotMerge": "لم يدمج {host} طلب الدمج (PR).",
  "handoff.hostRefused":
    "رفض {host} الدمج (حماية الفرع، تعارضات، أو صلاحيات الرمز).",
  "handoff.readFailed": "تعذّر على Snag قراءة طلب الدمج (PR) من {host}.",
  "handoff.checkFailed": "تعذّر على Snag فحص طلب الدمج (PR).",
};

export const MESSAGES = { en, ar } as const;

const PLACEHOLDER_RE = /\{([a-zA-Z0-9_]+)\}/g;

export function resolveLocale(value?: string | null): SnagLocale {
  if (typeof value !== "string") return "en";
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "en";
  const language = trimmed.split(/[-_]/)[0];
  return language === "ar" ? "ar" : "en";
}

export function directionFor(locale: SnagLocale): SnagDirection {
  return locale === "ar" ? "rtl" : "ltr";
}

export function translate(
  locale: SnagLocale,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const table = locale === "ar" ? ar : en;
  let text: string = table[key] ?? en[key];
  if (!vars) return text;
  return text.replace(PLACEHOLDER_RE, (match, name: string) =>
    vars[name] === undefined ? match : String(vars[name]),
  );
}

export function plural(
  locale: SnagLocale,
  count: number,
  one: Extract<MessageKey, `${string}.one`>,
  other: Extract<MessageKey, `${string}.other`>,
): string {
  const tag = locale === "ar" ? "ar" : "en";
  const rule = new Intl.PluralRules(tag).select(count);
  return translate(locale, rule === "one" ? one : other, { count });
}

export function placeholdersIn(value: string): string[] {
  return [...value.matchAll(PLACEHOLDER_RE)].map((match) => match[1]).sort();
}

export function statusMessageKey(
  status: string,
  rejectionReason?: string | null,
): MessageKey {
  if (status === "rejected" && rejectionReason === "policy_block") return "status.blocked";
  const key = `status.${status}` as MessageKey;
  return key in en ? key : "status.error";
}

export function toastTitleKey(
  status: string,
  rejectionReason?: string | null,
): MessageKey | null {
  if (status === "rejected" && rejectionReason === "policy_block") return "toast.blocked";
  const key = `toast.${status}` as MessageKey;
  return key in en ? key : null;
}

export const HANDOFF_CODES = {
  rules_changed: "handoff.rulesChanged",
  no_pr: "handoff.noPr",
  no_preview: "handoff.noPreview",
  ci_timeout: "handoff.ciTimeout",
  ci_failed: "handoff.ciFailed",
  no_checks: "handoff.noChecks",
  conflicts: "handoff.conflicts",
  daily_limit: "handoff.dailyLimit",
  merge_failed: "handoff.mergeFailed",
  delivery_changed: "handoff.deliveryChanged",
  unreachable: "handoff.unreachable",
  auth_failed: "handoff.authFailed",
  host_did_not_merge: "handoff.hostDidNotMerge",
  host_refused: "handoff.hostRefused",
  read_failed: "handoff.readFailed",
  check_failed: "handoff.checkFailed",
} as const satisfies Record<string, MessageKey>;

export type HandoffCode = keyof typeof HANDOFF_CODES;

export const STAGE_CODES = {
  planning: "stage.planning",
  building: "stage.building",
  waiting_preview: "stage.waitingPreview",
  waiting_checks: "stage.waitingChecks",
} as const satisfies Record<string, MessageKey>;

export type StageCode = keyof typeof STAGE_CODES;

function hostFromHandoffReason(reason: string | null | undefined): string | undefined {
  if (!reason) return undefined;
  const patterns = [
    /^Snag cannot reach the pull request on (.+)\.$/,
    /^Snag could not authenticate to (.+)\.$/,
    /^(.+) did not merge the pull request\.$/,
    /^(.+) refused the merge \(branch protection, conflicts, or token permissions\)\.$/,
    /^Snag could not read the pull request from (.+)\.$/,
  ];
  for (const pattern of patterns) {
    const match = reason.match(pattern);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

export function handoffMessage(
  locale: SnagLocale,
  code: string | null | undefined,
  fallback: string | null | undefined,
  vars?: Record<string, string | number>,
): string {
  if (code && code in HANDOFF_CODES) {
    const host = hostFromHandoffReason(fallback);
    return translate(locale, HANDOFF_CODES[code as HandoffCode], {
      ...(host ? { host } : {}),
      ...vars,
    });
  }
  return fallback ?? "";
}

export function stageMessage(
  locale: SnagLocale,
  code: string | null | undefined,
  fallback: string | null | undefined,
): string | null {
  if (code && code in STAGE_CODES) {
    return translate(locale, STAGE_CODES[code as StageCode]);
  }
  return fallback ?? null;
}

export { en, ar };
