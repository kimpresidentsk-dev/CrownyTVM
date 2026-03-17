// ═══════════════════════════════════════════════════════════════
// CROWNY — 153-Language Rotating Slogan with Geo-based Priority
// ═══════════════════════════════════════════════════════════════

const SLOGANS = [
  { id: 1, lang: "English", text: "Protecting Beauty, Empowering Safety: For Every Woman in the World." },
  { id: 2, lang: "Spanish", text: "Protegiendo la belleza, potenciando la seguridad: para cada mujer en el mundo." },
  { id: 3, lang: "French", text: "Protéger la beauté, renforcer la sécurité : pour chaque femme dans le monde." },
  { id: 4, lang: "Chinese (Simplified)", text: "守护美丽，赋能安全：为世界上的每一位女性。" },
  { id: 5, lang: "Japanese", text: "美しさを守り、安全을 授ける：世界中のすべての女性のために。" },
  { id: 6, lang: "Arabic", text: "حماية الجمال، تمكين الأمان: لكل امرأة في العالم." },
  { id: 7, lang: "Hindi", text: "सुंदरता की रक्षा, सुरक्षा का सशक्तिकरण: दुनिया की हर महिला के लिए।" },
  { id: 8, lang: "German", text: "Schönheit schützen, Sicherheit stärken: Für jede Frau auf der Welt." },
  { id: 9, lang: "Russian", text: "Защищая красоту, обеспечивая безопасность: Для каждой женщины в мире." },
  { id: 10, lang: "Portuguese", text: "Protegendo a beleza, fortalecendo a segurança: para cada mulher no mundo." },
  { id: 11, lang: "Vietnamese", text: "Bảo vệ vẻ đẹp, trao quyền an toàn: Vì mọi phụ nữ trên thế giới." },
  { id: 12, lang: "Thai", text: "ปกป้องความงาม เสริมสร้างความปลอดภัย: เพื่อผู้หญิงทุกคนในโลก" },
  { id: 13, lang: "Indonesian", text: "Melindungi Kecantikan, Memberdayakan Keamanan: Untuk Setiap Wanita di Dunia." },
  { id: 14, lang: "Italian", text: "Proteggere la bellezza, potenziare la sicurezza: per ogni donna nel mondo." },
  { id: 15, lang: "Turkish", text: "Güzelliği Korumak, Güvenliği Güçlendirmek: Dünyadaki her kadın için." },
  { id: 16, lang: "Tagalog", text: "Pagprotekta sa Kagandahan, Pagpapalakas ng Kaligtasan: Para sa Bawat Babae sa Mundo." },
  { id: 17, lang: "Bengali", text: "সৌন্দর্য রক্ষা, নিরাপত্তা সশক্তিকরণ: বিশ্বের প্রতিটি নারীর জন্য।" },
  { id: 18, lang: "Urdu", text: "خوبصورتی کی حفاظت، تحفظ کی بااختیاری: دنیا کی ہر عورت کے لیے۔" },
  { id: 19, lang: "Dutch", text: "Schoonheid beschermen, veiligheid versterken: voor elke vrouw ter wereld." },
  { id: 20, lang: "Korean", text: "아름다움을 지키고 안전을 부여하다: 세상 모든 여성을 위하여." },
  { id: 21, lang: "Polish", text: "Chroniąc piękno, wzmacniając bezpieczeństwo: Dla każdej kobiety na świecie." },
  { id: 22, lang: "Swedish", text: "Skyddar skönhet, stärker säkerhet: För varje kvinna i världen." },
  { id: 23, lang: "Greek", text: "Προστατεύοντας την ομορφιά, ενισχύοντας την ασφάλεια: Για κάθε γυναίκα στον κόσμο." },
  { id: 24, lang: "Hungarian", text: "A szépség védelme, a biztonság erősítése: A világ minden nője számára." },
  { id: 25, lang: "Czech", text: "Chránit krásu, posilovat bezpečnost: Pro každou ženu na světě." },
  { id: 26, lang: "Romanian", text: "Protejând frumusețea, consolidând siguranța: Pentru fiecare femeie din lume." },
  { id: 27, lang: "Ukrainian", text: "Захищаючи красу, зміцнюючи безпеку: Для кожної жінки у світі." },
  { id: 28, lang: "Swahili", text: "Kulinda Uzuri, Kuimarisha Usalama: Kwa Kila Mwanamke Duniani." },
  { id: 29, lang: "Amharic", text: "ውበትን መጠበቅ፣ ደህንነትን ማጠናከር፡ በዓለም ላይ ላለው እያንዳንዱ ሴት።" },
  { id: 30, lang: "Zulu", text: "Ukuzivikela Ubuhle, Ukunikeza Amandla Ukuphepha: Kubo bonke abafazi emhlabeni." },
  { id: 31, lang: "Yoruba", text: "Idabobo Ẹwa, Agbara Abo: Fun Gbogbo Obirin ni agbaye." },
  { id: 32, lang: "Igbo", text: "Ichedo Mma, Inye Ike na Nchekwa: Maka ụmụ nwanyị niile nọ n'ụwa." },
  { id: 33, lang: "Persian", text: "محافظت از زیبایی، توانمندسازی امنیت: برای هر زن در جهان." },
  { id: 34, lang: "Kazakh", text: "Сұлулықты қорғау, қауіпсіздікті нығайту: Әлемдегі әрбір әйел үшін." },
  { id: 35, lang: "Hebrew", text: "הגנה על היופי, העצמת הביטחון: לכל אישה בעולם." },
  { id: 36, lang: "Azerbaijani", text: "Gözəlliyi qorumaq, təhlükəsizliyi gücləndirmək: Dünyadakı hər bir qadın üçün." },
  { id: 37, lang: "Finnish", text: "Kauneuden suojelu, turvallisuuden vahvistaminen: jokaiselle maailman naiselle." },
  { id: 38, lang: "Norwegian", text: "Beskytter skjønnhet, styrker sikkerhet: For hver kvinne i verden." },
  { id: 39, lang: "Danish", text: "Beskytter skønhed, styrker sikkerhed: For enhver kvinde i verden." },
  { id: 40, lang: "Catalan", text: "Protegir la bellesa, potenciar la seguretat: per a cada dona del món." },
  { id: 41, lang: "Slovak", text: "Chrániť krásu, posilňovať bezpečnosť: Pre každú ženu na svete." },
  { id: 42, lang: "Bulgarian", text: "Защита на красотата, овластяване на безопасността: За всяка женщина по света." },
  { id: 43, lang: "Lithuanian", text: "Saugoti grožį, stiprinti saugumą: kiekvienai pasaulio moteriai." },
  { id: 44, lang: "Latvian", text: "Skaistuma aizsardzība, drošības stiprināšana: ikvienai sievietei pasaulē." },
  { id: 45, lang: "Estonian", text: "Ilu kaitsmine, turvalisuse tagamine: igale naisele maailmas." },
  { id: 46, lang: "Slovenian", text: "Varovanje lepote, opolnomočenje varnosti: za vsako žensko na svetu." },
  { id: 47, lang: "Croatian", text: "Zaštita ljepote, jačanje sigurnosti: Za svaku ženu na svijetu." },
  { id: 48, lang: "Serbian", text: "Заштита лепоте, оснаживање безбедности: За сваку жену на свету." },
  { id: 49, lang: "Albanian", text: "Mbrojtja e bukurisë, fuqizimi i sigurisë: Për çdo grua në botë." },
  { id: 50, lang: "Macedonian", text: "Заштита на убавината, зајакнување на безбедноста: За секоја жена во светот." },
  { id: 51, lang: "Georgian", text: "სილამაზის დაცვა, უსაფრთხოების გაძლიერება: ყველა ქალისთვის მსოფლიოში." },
  { id: 52, lang: "Armenian", text: "Պաշտpanelov geghetsKutyunE, zoratsnelov anvtangutyunE: ashkharhi yurakanchyur knoje hamar." },
  { id: 53, lang: "Icelandic", text: "Að vernda fegurð, efla öryggi: Fyrir hverja konu í heiminum." },
  { id: 54, lang: "Maltese", text: "Nipproteġu l-sbuħija, nagħtu s-saħħa lis-sigurtà: Għal kull mara fid-dinja." },
  { id: 55, lang: "Basque", text: "Edurtasuna babestuz, segurtasuna indartuz: munduko emakume bakoitzarentzat." },
  { id: 56, lang: "Irish", text: "Áilleacht a chosaint, slándáil a chumhachtú: Do gach bean ar domhan." },
  { id: 57, lang: "Welsh", text: "Amddiffyn harddwch, grymuso diogelwch: I bob menyw yn y byd." },
  { id: 58, lang: "Malayalam", text: "സൌന്ദര്യം സംരക്ഷിക്കുന്നു, സുരക്ഷ ശാക്തീകരിക്കുന്നു: ലോകത്തിലെ ഓരോ സ്ത്രീക്കും വേണ്ടി." },
  { id: 59, lang: "Telugu", text: "అందాన్ని రక్షించడం, భద్రతను బలోపేతం చేయడం: ప్రపంచంలోని ప్రతి మహిళ కోసం." },
  { id: 60, lang: "Kannada", text: "ಸೌಂದರ್ಯವನ್ನು ರಕ್ಷಿಸುವುದು, ಸುರಕ್ಷತೆಯನ್ನು ಸಬಲೀಕರಣಗೊಳಿಸುವುದು: ವಿಶ್ವದ ಪ್ರತಿ ಮಹಿಳೆಯರಿಗಾಗಿ." },
  { id: 61, lang: "Tamil", text: "அழகைப் பாதுகாத்தல், பாதுகாப்பை மேம்படுத்துதல்: உலகில் உள்ள ஒவ்வொரு பெண்ணுக்காகவும்." },
  { id: 62, lang: "Marathi", text: "सौंदर्याचे रक्षण, सुरक्षिततेचे सक्षमीकरण: जगातील प्रत्येक महिलेसाठी." },
  { id: 63, lang: "Gujarati", text: "સુંદરતાનું રક્ષણ, સુરક્ષાનું સશક્તિકરણ: વિશ્વની દરેક મહિલા માટે." },
  { id: 64, lang: "Punjabi", text: "ਸੁੰਦਰਤਾ ਦੀ ਰੱਖਿਆ, ਸੁਰੱਖਿਆ ਦਾ ਸਸ਼ਕਤੀਕਰਨ: ਦੁਨੀਆ ਦੀ ਹਰ ਔਰਤ ਲਈ।" },
  { id: 65, lang: "Sinhala", text: "රූපය සුරැකීම, ආරක්ෂාව බලගැන්වීම: ලොව සෑම කාන්තාවක් සඳහාම." },
  { id: 66, lang: "Burmese", text: "အလှအပကိုကာကွယ်ခြင်း၊ လုံခြုံမှုကိုမြှင့်တင်ခြင်း - ကမ္ဘာပေါ်ရှိအမျိုးသမီးတိုင်းအတွက်။" },
  { id: 67, lang: "Khmer", text: "ការពារសម្រស់ ពង្រឹងសុវត្ថិភាព៖ សម្រាប់ស្ត្រីគ្រប់រូបនៅក្នុងពិភពលោក។" },
  { id: 68, lang: "Lao", text: "ປົກປ້ອງຄວາມງາມ, ເສີມສ້າງຄວາມປອດໄພ: ສໍາລັບແມ່ຍິງທຸກຄົນໃນໂລກ." },
  { id: 69, lang: "Mongolian", text: "Гоо сайхныг хамгаалж, аюулгүй байдлыг бэхжүүлэх нь: Дэлхийн эмэгтэй бүрийн төлөө." },
  { id: 70, lang: "Kyrgyz", text: "Сулуулукту коргоо, коопсуздукту чыңдоо: Дүйнөдөгү ар бир аял үчүн." },
  { id: 71, lang: "Tajik", text: "Ҳифзи зебоӣ, таҳкими амният: Барои ҳар як зан дар ҷаҳон." },
  { id: 72, lang: "Uzbek", text: "Go'zallikni himoya qilish, xavfsizlikni kuchaytirish: Dunyodagi har bir ayol uchun." },
  { id: 73, lang: "Turkmen", text: "Gözelligi goramak, howpsuzlygy güýçlendirmek: Dünýädäki her bir aýal üçin." },
  { id: 74, lang: "Kazakh (Latin)", text: "Sululyqty qorǵau, qauipsizdikti nyǵaitu: Álemdegi árbir áiel úshin." },
  { id: 75, lang: "Nepali", text: "सुन्दरताको रक्षा, सुरक्षाको सशक्तीकरण: संसारका हरेक महिलाका लागि।" },
  { id: 76, lang: "Maori", text: "Te tiaki i te ataahua, te whakamana i te haumaru: Mo nga wahine katoa o te ao." },
  { id: 77, lang: "Samoan", text: "Puipuia le matagofie, faʻamalosia le saogalemu: Mo fafine uma i le lalolagi." },
  { id: 78, lang: "Fijian", text: "Taqomaki na totoka, vakaukauwataki na tiko savasava: Vei ira na yalewa kece e vuravura." },
  { id: 79, lang: "Quechua", text: "Sumaq kayta hark'aspa, allin kawsayta qispichispa: Tukuy teqsimuyuntin warmikunapaq." },
  { id: 80, lang: "Guarani", text: "Jajapo porãva ñangareko, teko sãmbyhy py'aguapy: Opavẽ kuñanguérape g̃uarã yvypóra retãme." },
  { id: 81, lang: "Aymara", text: "K'achachawir uñjaña, qasawi ch'amanchaña: Taqi pacha warminakataki." },
  { id: 82, lang: "Nahuatl", text: "In kualnezkayotl tlapaluiz, in tlayolchikaualistli tlamatiliztli: Ihuicpa mochi siuamej ipan tlatikpaktli." },
  { id: 83, lang: "Haitian Creole", text: "Pwoteje bote, ranfòse sekirite: Pou chak fanm nan mond lan." },
  { id: 84, lang: "Afrikaans", text: "Beskerm skoonheid, versterk veiligheid: Vir elke vrou in die wêreld." },
  { id: 85, lang: "Hausa", text: "Kare Kyau, Karfafa Tsaro: Ga kowace mace a duniya." },
  { id: 86, lang: "Oromo", text: "Bareedina eeguu, nageenya jabeessuu: Dubartoota addunyaa maraaf." },
  { id: 87, lang: "Somali", text: "Ilaalinta quruxda, xoojinta badbaadada: Naag kasta oo adduunka joogta." },
  { id: 88, lang: "Shona", text: "Kuchengetedza runako, kusimbisa kuchengetedzeka: Kumukadzi wese ari munyika." },
  { id: 89, lang: "Chichewa", text: "Kuteteza kukongola, kulimbikitsa chitetezo: Kwa amayi onse padziko lapansi." },
  { id: 90, lang: "Kinyarwanda", text: "Kurinda ubwiza, gushimangira umutekano: Ku mugore wese ku isi." },
  { id: 91, lang: "Wolof", text: "Toppu rafetay, dëgëral kaaraange: Ngir mboolem jiggéen ci àdduna bi." },
  { id: 92, lang: "Sesotho", text: "Ho sireletsa botle, ho matlafatsa tšireletseho: Bakeng sa mosali e mong le e mong lefatšeng." },
  { id: 93, lang: "Tswana", text: "Go sireletsa bontle, go nonotsha tshireletsego: Mo mosading mongwe le mongwe mo lefatsheng." },
  { id: 94, lang: "Xhosa", text: "Ukukhusela ubuhle, ukuxhobisa ukhuseleko: Kubo bonke abafazi emhlabeni." },
  { id: 95, lang: "Luganda", text: "Okukuuma obulungi, okunyweza obukuumi: Eri buli mukazi mu nsi." },
  { id: 96, lang: "Tigrinya", text: "ጽባቐ ምክልኻል፡ ድሕንነት ምርግጋጽ፡ ኣብ ዓለም ንዘለዋ ኩለን ኣንስቲ።" },
  { id: 97, lang: "Bambara", text: "Cèñi lakanani, haminanko fanga: Diñɛ muso bɛɛ ye." },
  { id: 98, lang: "Latin", text: "Pulchritudinem protegens, salutem confirmans: pro omni muliere in mundo." },
  { id: 99, lang: "Esperanto", text: "Protektante belecon, povigante sekurecon: Por ĉiu virino en la mondo." },
  { id: 100, lang: "Sanskrit", text: "सौन्दर्यस्य रक्षणम्, सुरक्षायाः सक्षमीकरणम्: विश्वस्य प्रत्येकनार्यै।" },
  { id: 101, lang: "Yiddish", text: "היטן שיינהייט, באַשטאַרקן זיכערקייט: פֿאַר יעדער פֿרוי אין דער וועלט." },
  { id: 102, lang: "Luxembourgish", text: "Schéinheet schützen, Sécherheet stäerken: Fir all Fra op der Welt." },
  { id: 103, lang: "Frisian", text: "Schientme beskermje, feiligens fersterkje: Foar elke frou yn de wrâld." },
  { id: 104, lang: "Galician", text: "Protexendo a beleza, potenciando a seguridade: para cada muller no mundo." },
  { id: 105, lang: "Indonesian (Formal)", text: "Melindungi keanggunan, menjamin keselamatan: Bagi setiap wanita di jagat raya." },
  { id: 106, lang: "Malay", text: "Memelihara keindahan, memperkasakan keselamatan: Untuk setiap wanita di dunia." },
  { id: 107, lang: "Pashto", text: "د ښکلا ساتنه، د خوندیتوب پیاوړتیا: په نړۍ کې د هرې میرمنې لپاره." },
  { id: 108, lang: "Sindhi", text: "خوبصورتي جي حفاظت, حفاظت کي بااختيار بڻائڻ: دنيا جي هر عورت لاءِ." },
  { id: 109, lang: "Kurdish (Kurmanji)", text: "Parastina bedewiyê, xurtkirina ewlehiyê: Ji bo her jina li cîhanê." },
  { id: 110, lang: "Kurdish (Sorani)", text: "پاراستنی جوانی، بەهێزکردنی ئاسایش: بۆ هەموو ژنێکی جیهان." },
  { id: 111, lang: "Uyghur", text: "گۈزەللىكنى قوغداش، بىخەتەرلىكنى كۈچەيتىش: دۇنيادىكى ھەر بىر ئايال ئۈچۈن." },
  { id: 112, lang: "Tatar", text: "Гүзәллекне саклау, куркынычсызлыкны ныгыту: Дөньядагы һәр хатын-кыз өчен." },
  { id: 113, lang: "Bashkir", text: "Гүзәллекте һаҡлау, именлекте нығытыу: Донъялағы һәр ҡатын-ҡыҙ өсөн." },
  { id: 114, lang: "Javanese", text: "Njaga kaendahan, nguatake kaslametan: Kanggo saben wanita in donya." },
  { id: 115, lang: "Sundanese", text: "Ngajaga kageulisan, nguatkeun kasalametan: Pikeun unggal awéwé di dunya." },
  { id: 116, lang: "Cebuano", text: "Pagpanalipod sa katahum, paghatag gahum sa kaluwasan: Alang sa matag babaye sa kalibutan." },
  { id: 117, lang: "Hmong", text: "Tiv thaiv kev zoo nkauj, txhawb kev nyab xeeb: Rau txhua tus poj niam hauv ntiaj teb." },
  { id: 118, lang: "Tibetan", text: "མཛེས་སྡུག་སྲུང་སྐྱོབ་དང་བདེ་འཇགས་ནུས་སྤེལ། འཛམ་གླིང་གི་བུད་མེད་ཡོངས་ཀྱི་ཆེད་དུ་།" },
  { id: 119, lang: "Sanskrit (Vedic)", text: "सौन्दर्यं रक्षन्तः, अभयं वर्धयन्तः। विश्वनारीभ्यः॥" },
  { id: 120, lang: "Korean (Classical)", text: "美를 수호하고 安을 부여함이라: 천하의 모든 여성을 위하노니." },
  { id: 121, lang: "Breton", text: "Gwareziñ ar gened, galloudaat an diogelroez: evit pep plac'h er bed." },
  { id: 122, lang: "Occitan", text: "Protegir la beutat, enfortir la seguretat: per cada femna del mond." },
  { id: 123, lang: "Romansh", text: "Proteger la bellezza, rinforzar la segirezza: per mintga dunna en il mund." },
  { id: 124, lang: "Faroese", text: "Verja vakurleika, styrkja trygd: Fyri hvørja kvinnu í heiminum." },
  { id: 125, lang: "Sardinian", text: "Amparare sa bellesa, potentziare sa seguresa: pro dogni fèmina in su mundu." },
  { id: 126, lang: "Corsican", text: "Prutege a bellezza, rinfurzà a sicurità: per ogni donna in u mondu." },
  { id: 127, lang: "Upper Sorbian", text: "Škitanje rjanosće, zmocnjenje wěstoty: za kóždu žonu na swěće." },
  { id: 128, lang: "Low German", text: "Schöönheit schulen, Sekerheit stärken: För jede Fro op de Welt." },
  { id: 129, lang: "Asturian", text: "Protexer la guapura, potenciar la seguridá: pa cada muyer nel mundu." },
  { id: 130, lang: "Balinese", text: "Ngajegang kalulutan, nincapang krahajengan: Majeng ring sinamian istri ring jagate." },
  { id: 131, lang: "Madurese", text: "Ajaga kaendahan, makoat kaamanan: Kangge sakabbina bini' e dunnya." },
  { id: 132, lang: "Assamese", text: "সৌন্দৰ্য সুৰক্ষা, নিৰাপত্তা সবলীকৰণ: বিশ্বৰ প্ৰতিগৰাকী মহিলাৰ বাবে।" },
  { id: 133, lang: "Maithili", text: "सुंदरताक रक्षा, सुरक्षाक सक्षमीकरण: संसारक प्रत्येक महिलाक लेल।" },
  { id: 134, lang: "Santali", text: "ᱪᱚᱨᱚᱠ ᱵᱟᱧᱪᱟᱣ, ᱥᱟᱶᱟᱨ ᱫᱟᱲᱮᱭᱟᱱ: ᱫᱷᱟᱹᱨᱛᱤ ᱨᱤᱱ ᱡᱚᱛᱚ ᱛᱤᱨᱞᱟᱹ ᱞᱟᱹᱜᱤᱫ᱾" },
  { id: 135, lang: "Konkani", text: "सोबीतकाय राखप, सुरक्षा बळीश करप: संवसारांतल्या दर एका अस्तुरे खातीर." },
  { id: 136, lang: "Dzongkha", text: "མཛེས་ཆ་སྲུང་སྐྱོབ་དང་ཉེན་སྲུང་ནུས་ཤུགས་སྤེལ་བ། འཛམ་གླིང་ནང་གི་ཨམ་ཅུ་ཐམས་ཅད་ཀྱི་དོན་ལུ་།" },
  { id: 137, lang: "Tetum", text: "Proteje kmanek, hametin seguransa: ba feto hotu-hotu iha mundu." },
  { id: 138, lang: "Bislama", text: "Protektem gudfala lukluk, givim paoa long sefti: Blong evri woman long wol." },
  { id: 139, lang: "Tok Pisin", text: "Protektim naispla lukluk, givim pawa long sefti: Bilong olgeta meri long graun." },
  { id: 140, lang: "Chamorro", text: "Protehi i bunitu, na'metgot i seguridåt: Para todu i famalao'an gi tano'." },
  { id: 141, lang: "Marshallese", text: "Kejbarok iitok, kōkajoor kōjparok: Ñan aolep kōrā ro ilo lal in." },
  { id: 142, lang: "Inuktitut", text: "ᓴᐳᒻᒥᓂᖅ ᐱᐅᓂᕐᒥᒃ, ᐱᔪᓐᓇᖅᓯᑎᑦᑎᓂᖅ ᐊᑦᑕᕐᓇᖅᑕᐃᓕᓂᕐᒥᒃ: ᐊᕐᓇᓕᒫᓄᑦ ᓯᓚᕐᔪᐊᒥ." },
  { id: 143, lang: "Cherokee", text: "ᎤᏬᏚᎯ ᎦᏘᏯ, ᎠᏓᏍᏕᎸᏗ ᎠᏓᏅᏓᏗᏍᏗ: ᏂᎦᏛ ᎠᏂᎨᏯ ᎡᎶᎯ ᎤᎾᏤᎵᎦ." },
  { id: 144, lang: "Yucatec Maya", text: "Kanáantik u jats'util, mu'uk'ankúuntik u li'saj óol: Utia'al tuláakal ko'olelo'ob ti' yóok'ol kaab." },
  { id: 145, lang: "Tumbuka", text: "Kuvikira kutowa, kukhozga chivikiliro: Kwa mwanakazi waliyose pa charu." },
  { id: 146, lang: "Bemba", text: "Ukusungilila ubusuma, ukukosya umucinshi: Kuli banamayo bonse pano isonde." },
  { id: 147, lang: "Kanuri", text: "Nguro dabu kaji, dabu sando: Kam nji dunya nibe hamma so ro." },
  { id: 148, lang: "Mende", text: "Nyandehun kpalo, hinda luma gbe: Nya nyahanga gbii ma ndunyu hu." },
  { id: 149, lang: "Ewe", text: "Dekakpui dzidzi, dedienɔnɔ sesẽ: Na nyɔnuwo katã le xexeame." },
  { id: 150, lang: "Fon", text: "Dekamɛ dodo, jidide hɛn gannu: Na nyɔnu lɛ bǐ ɖo gbɛ ɔ mɛ." },
  { id: 151, lang: "Krio", text: "Protɛkt fayn luk, gi pawa to sefti: Fɔ ɛvri uman na dis wɔl." },
  { id: 152, lang: "Papiamento", text: "Protehá bunitesa, fortalesé seguridat: pa tur muher na mundu." },
  { id: 153, lang: "Kalaallisut", text: "Kusanassuseq illersorlugu, isumannaassuseq nakussassarberlugu: silarsuarmi arnanut tamanut." }
];

// RTL language IDs
const RTL_IDS = new Set([6, 18, 33, 35, 101, 107, 108, 110, 111]);

// Region → priority slogan IDs
const REGION_LANGUAGES = {
  'ko': [20, 120, 5, 4, 1],
  'ja': [5, 20, 4, 1],
  'zh': [4, 5, 20, 1],
  'en': [1, 2, 3, 10, 8],
  'es': [2, 1, 10, 3, 14],
  'fr': [3, 1, 2, 14],
  'de': [8, 19, 22, 1],
  'pt': [10, 2, 1],
  'ar': [6, 33, 107, 1],
  'hi': [7, 64, 17, 1],
  'ru': [9, 27, 34, 1],
  'vi': [11, 1, 4],
  'th': [12, 1, 4],
  'id': [13, 106, 1],
  'tr': [15, 36, 1],
  'tl': [16, 1, 2],
  'sw': [28, 85, 87, 1]
};

const DEFAULT_PRIORITY = [1, 20, 4, 5, 2];

// ── Rotation Engine ──
(function() {
  const container = document.getElementById('slogan-rotator');
  if (!container) return;

  const textEl = container.querySelector('.slogan-text');
  const langEl = container.querySelector('.slogan-lang');
  if (!textEl || !langEl) return;

  // Detect user language
  function getUserLang() {
    const langs = navigator.languages || [navigator.language || 'en'];
    for (const l of langs) {
      const code = l.split('-')[0].toLowerCase();
      if (REGION_LANGUAGES[code]) return code;
    }
    return null;
  }

  // Build ordered playlist
  function buildPlaylist() {
    const lang = getUserLang();
    const priorityIds = lang ? REGION_LANGUAGES[lang] : DEFAULT_PRIORITY;
    const prioritySlogans = priorityIds.map(id => SLOGANS.find(s => s.id === id)).filter(Boolean);
    const priorityIdSet = new Set(priorityIds);
    const rest = SLOGANS.filter(s => !priorityIdSet.has(s.id));
    // Fisher-Yates shuffle
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    return [...prioritySlogans, ...rest];
  }

  const playlist = buildPlaylist();
  let idx = 0;
  let timer = null;

  function show(slogan) {
    // Fade out
    textEl.style.opacity = '0';
    langEl.style.opacity = '0';

    setTimeout(() => {
      const isRTL = RTL_IDS.has(slogan.id);
      textEl.textContent = slogan.text;
      textEl.dir = isRTL ? 'rtl' : 'ltr';
      textEl.style.textAlign = 'center';
      langEl.textContent = slogan.lang;
      // Fade in
      textEl.style.opacity = '1';
      langEl.style.opacity = '1';
    }, 600);
  }

  function next() {
    show(playlist[idx]);
    idx = (idx + 1) % playlist.length;
  }

  // Start
  next();
  timer = setInterval(next, 3500);

  // Pause on hover
  container.addEventListener('mouseenter', () => clearInterval(timer));
  container.addEventListener('mouseleave', () => { timer = setInterval(next, 3500); });
})();
