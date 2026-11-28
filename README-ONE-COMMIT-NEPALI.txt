SAINO — ONE COMMIT REPLACEMENT PACKAGE
======================================

यो ZIP भित्र index.html र assets/ folder छन्। यी फाइलहरू आफ्नो GitHub repository को root मा राखेर सोही path का पुराना फाइल Replace गर्नुहोस्। त्यसपछि सबै परिवर्तन एउटै commit मा stage गरेर commit गर्न सकिन्छ।

मुख्य परिवर्तन
--------------
1. assets/js/navigation.js अब पाँचवटा स्थायी tab को एकमात्र मालिक हो: Chat, Friend, Feed, Story, Profile.
2. assets/css/navigation.css मा Navigation को सम्पूर्ण डिजाइन छ।
3. app.js बाट Navigation markup र login/header Language Toggle हटाइएको छ। Login/Signup/Logout र Chat को वास्तविक logic सुरक्षित छ।
4. friends.js र feed-ui.js ले Navigation बटन बनाउँदैनन्; तिनले आफ्नै content मात्र चलाउँछन्।
5. profile-ui.js र settings-ui.js ले Navigation मा duplicate बटन बनाउँदैनन्। Profile भित्र Settings shortcut छ।
6. Settings मा Account, General/Language, Notifications, Chat, Privacy र Security छन्। Security मा registered email मा password reset link पठाउने सुविधा छ।
7. Story tab का लागि छुट्टै UI shell थपिएको छ। हालको ZIP मा Story backend/publishing/viewing system छैन, त्यसैले यसले Coming Soon अवस्था देखाउँछ; बनिसकेको Story सुविधा भनेर देखाउँदैन।
8. Group shortcut लाई पाँच मुख्य tab बाहिर header मा राखिएको छ। Notifications पनि header मा रहन्छ।
9. index.html मा Story module र stylesheet जोडिएको छ।

फाइल जिम्मेवारी
----------------
- assets/js/navigation.js + assets/css/navigation.css: पाँच primary tabs
- assets/js/app.js: authentication lifecycle र chat application shell
- assets/js/friends.js: friends data/UI
- assets/js/feed-ui.js: feed data/UI
- assets/js/story-ui.js + assets/css/story.css: Story tab shell
- assets/js/profile-ui.js + assets/css/profile.css: Profile
- assets/js/settings-ui.js + assets/css/settings.css: Account/Privacy/Settings
- assets/js/group-management-ui.js: Group management (header shortcut)
- assets/css/app.css: मुख्य app layout, authentication र chat styles

app.css किन package मा छैन?
---------------------------
हालको app.css मा primary Navigation को styling छैन। Navigation styling पहिल्यै navigation.css मा छ। त्यसैले app.css लाई अनावश्यक रूपमा overwrite नगरी जस्ताको तस्तै राखिएको छ। यसले Chat/Login का आवश्यक styles सुरक्षित राख्छ।

एक commit
---------
सबै replacement/addition files एकैचोटि लागू भएपछि Git मा एउटै commit गर्नुहोस्।

Validation
----------
सबै assets/js/*.js र core/*.js फाइलहरूमा Node.js syntax check सफल भएको छ। Browser/Supabase runtime integration भने वास्तविक deployment मा smoke-test गर्नुपर्छ।
