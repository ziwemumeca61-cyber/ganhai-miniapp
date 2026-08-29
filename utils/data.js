const { distanceKm, formatDistance } = require('./geo')
const { safetyScoreWithConditions, scoreLabel } = require('./predict')

const cities = [
  { id: 'yantai', name: '烟台', latitude: 37.536, longitude: 121.45, scale: 8 },
  { id: 'qingdao', name: '青岛', latitude: 36.08, longitude: 120.38, scale: 8 },
  { id: 'weihai', name: '威海', latitude: 37.43, longitude: 122.12, scale: 8 },
  { id: 'rizhao', name: '日照', latitude: 35.42, longitude: 119.55, scale: 9 },
  { id: 'weifang', name: '潍坊', latitude: 37.1, longitude: 119.2, scale: 8 },
  { id: 'dongying', name: '东营', latitude: 37.65, longitude: 119.05, scale: 8 },
  { id: 'binzhou', name: '滨州', latitude: 38.0, longitude: 118.05, scale: 8 }
]

const pendingGuide = {
  entry: '待实地核验，暂不提供入口建议',
  shoreline: '待实地核验，暂不提供岸段建议',
  direction: '待实地核验，暂不提供路线建议',
  retreat: '待实地核验，暂不提供撤离建议'
}

const positionGuides = {
  jinshatan: { shoreSide: '瞭望台北侧近岸沙滩', offshoreRange: '固定岸线外约0—80米退潮裸露区' },
  jiahekou: { shoreSide: '古贝广场北侧、夹河口外侧岸段', offshoreRange: '固定岸线外约0—100米泥沙滩' },
  'first-bath': { shoreSide: '公共入口东侧裸露礁石与近岸沙滩', offshoreRange: '固定岸线外约0—50米' },
  jinhaiwan: { shoreSide: '旅游大世界临海一侧近岸', offshoreRange: '固定岸线外约0—60米' },
  'moon-bay': { shoreSide: '月亮老人东侧可见礁石岸段', offshoreRange: '固定岸线外约0—40米' },
  dongpaotai: { shoreSide: '东炮台东侧往海韵广场方向', offshoreRange: '固定岸线外约0—40米' },
  'second-bath': { shoreSide: '入口北侧礁石、南侧沙滩', offshoreRange: '固定岸线外约0—60米' },
  yanda: { shoreSide: '导航点东侧、烟台大学临海一侧', offshoreRange: '固定岸线外约0—80米退潮裸露区' },
  tianyuewan: { shoreSide: '酒店临海东侧公开沙滩方向', offshoreRange: '固定岸线外约0—80米退潮裸露区' },
  beizhai: { shoreSide: '北寨临海一侧、辛安河口外侧', offshoreRange: '固定岸线外约0—60米' },
  fenbei: { shoreSide: '辛安河特大桥西北侧公开沙滩', offshoreRange: '固定岸线外约0—80米退潮裸露区' },
  'yangmadao-front': { shoreSide: '养马岛海水浴场南侧近岸', offshoreRange: '固定岸线外约0—80米退潮裸露区' },
  'yangmadao-back': { shoreSide: '养马岛北侧后海礁石岸段', offshoreRange: '固定岸线外约0—40米' },
  'haiyang-wanmi': { shoreSide: '海景路南侧公开海滩', offshoreRange: '固定岸线外约0—100米退潮裸露区' },
  'longkou-donghai-west': { shoreSide: '海涛二路西侧海水浴场近岸', offshoreRange: '固定岸线外约0—100米退潮裸露区' },
  'penglai-bath-nearby': { shoreSide: '仙境路北侧海滩方向', offshoreRange: '固定岸线外约0—80米退潮裸露区' }
}

const spots = [
  { id: 'jinshatan', name: '金沙滩海滨公园（瞭望台附近）', area: '黄渤海新区', latitude: 37.573856, longitude: 121.260837, type: '沙滩', harvest: '蛤蜊 · 海肠', verification: '附近导航点已核验', terrainSafety: 18, entry: '金沙滩海滨公园瞭望台附近导航点', shoreline: '瞭望台周边海岸，实际下滩口以现场公开通道为准', direction: '到达后先确认开放通道，不穿越绿化、护栏或管理围挡', retreat: '回涨前返回海滨路一侧，现场关闭或警戒时立即结束' },
  { id: 'jiahekou', name: '夹河口—古贝广场', area: '芝罘区', latitude: 37.5672, longitude: 121.3345, type: '泥沙滩', harvest: '蛤蜊 · 海蛎子', verification: '公开资料待复核', terrainSafety: 14, ...pendingGuide },
  { id: 'first-bath', name: '第一海水浴场', area: '芝罘区', latitude: 37.536201, longitude: 121.419746, type: '沙滩', harvest: '海螺 · 小螃蟹', verification: 'POI坐标已核验', terrainSafety: 18, entry: '第一海水浴场公共入口', shoreline: '东侧裸露礁石与岸边沙滩，以现场开放区域为限', direction: '优先核对东侧礁石区，不进入游泳分隔区', retreat: '涨潮前至少30分钟回到固定岸线' },
  { id: 'jinhaiwan', name: '金海湾—旅游大世界', area: '芝罘区', latitude: 37.535687, longitude: 121.42711, type: '礁石 + 沙滩', harvest: '海螺 · 螃蟹', verification: '候选点待实地', terrainSafety: 15, ...pendingGuide },
  { id: 'moon-bay', name: '月亮湾', area: '芝罘区', latitude: 37.534699, longitude: 121.432033, type: '礁石', harvest: '螃蟹 · 海螺', verification: 'POI坐标已核验', terrainSafety: 15, entry: '滨海北路月亮湾公共步行入口', shoreline: '月亮老人周边可见礁石岸段，以护栏和现场提示为界', direction: '仅观察退潮后裸露礁石，不翻越护栏', retreat: '发现回涨或浪花越过外缘立即撤离' },
  { id: 'dongpaotai', name: '东炮台—海韵广场', area: '芝罘区', latitude: 37.534003, longitude: 121.436541, type: '礁石', harvest: '海螺 · 小螃蟹', verification: 'POI坐标已核验', terrainSafety: 15, entry: '东炮台公园公共入口', shoreline: '东炮台东侧至海韵广场方向的开放岸段', direction: '避开海豹湾生态保育和任何封闭区域', retreat: '涨潮前30分钟离开低位礁石' },
  { id: 'second-bath', name: '第二海水浴场', area: '莱山区', latitude: 37.520652, longitude: 121.449064, type: '礁石 + 沙滩', harvest: '螃蟹 · 海螺', verification: 'POI坐标已核验', terrainSafety: 15, entry: '第二海水浴场公共入口', shoreline: '北侧礁石、南侧沙滩的现场开放岸段', direction: '礁石与沙滩分开判断，不跨越管理隔离', retreat: '回涨前返回主沙滩或硬质步道' },
  { id: 'yanda', name: '烟大海水浴场（附近）', area: '莱山区', latitude: 37.4862, longitude: 121.4625, type: '沙滩', harvest: '蛤蜊 · 蛏子', verification: '附近导航点已核验', terrainSafety: 18, entry: '滨海中路与黄海路交叉口东100米附近导航点', shoreline: '烟台大学东侧海岸，实际下滩口以现场公开通道为准', direction: '到达后沿滨海公共步道寻找开放入口，不跨越护栏或管理边界', retreat: '回涨前返回滨海中路一侧，遇封闭或警戒立即停止' },
  { id: 'tianyuewan', name: '天越湾酒店附近沙滩', area: '莱山区', latitude: 37.46145, longitude: 121.488068, type: '沙滩', harvest: '小螃蟹 · 海螺', verification: '附近导航点已核验', terrainSafety: 18, entry: '滨海中路1599号天越湾酒店附近导航点', shoreline: '天越湾酒店临海一侧沙滩，实际下滩口以现场公开通道为准', direction: '到达后寻找公开步道，不进入酒店专属、收费或封闭区域', retreat: '回涨前返回滨海中路一侧，现场关闭或警戒时立即结束' },
  { id: 'beizhai', name: '北寨—辛安河口', area: '高新区', latitude: 37.4418, longitude: 121.5385, type: '礁石 + 沙滩', harvest: '海螺 · 小螃蟹', verification: '候选点待实地', terrainSafety: 15, ...pendingGuide },
  { id: 'fenbei', name: '粉贝沙滩', area: '高新区', latitude: 37.443113, longitude: 121.550549, type: '沙滩', harvest: '贝壳 · 小螃蟹', verification: 'POI坐标已核验', terrainSafety: 18, entry: '滨海东路靠近海河西路一侧公共入口', shoreline: '辛安河特大桥西北侧公开沙滩岸段', direction: '远离河口急流、桥墩和施工围挡', retreat: '水位开始持续上升时返回道路侧' },
  { id: 'yangmadao-front', name: '养马岛前海', area: '牟平区', latitude: 37.474548, longitude: 121.644837, type: '沙滩', harvest: '海螺 · 小螃蟹', verification: 'POI坐标已核验', terrainSafety: 18, entry: '养马岛海水浴场公共入口', shoreline: '海水浴场近岸公开区域，以现场管理边界为准', direction: '只在平缓近岸活动，不向离岸礁石延伸', retreat: '预留30分钟返回入口，天气突变立即结束' },
  { id: 'yangmadao-back', name: '养马岛后海', area: '牟平区', latitude: 37.486, longitude: 121.606, type: '礁石', harvest: '海螺 · 螃蟹', verification: '候选点待实地', terrainSafety: 15, ...pendingGuide },
  { id: 'haiyang-wanmi', name: '海阳凤城万米海滩', area: '海阳市', latitude: 36.69538, longitude: 121.225813, type: '沙滩', harvest: '贝类 · 小螃蟹', verification: 'POI坐标已核验', terrainSafety: 18, entry: '凤城万米海滩公共入口', shoreline: '海景路沿线公开海水浴场岸段，以现场开放区域为限', direction: '仅在平缓沙滩和现场允许区域活动', retreat: '回涨前返回海景路一侧，浴场关闭或警戒时立即结束' },
  { id: 'longkou-donghai-west', name: '东海度假区西部夏季海水浴场', area: '龙口市', latitude: 37.715873, longitude: 120.411911, type: '沙滩', harvest: '贝类 · 小鱼', verification: 'POI坐标已核验', terrainSafety: 18, entry: '海涛二路6号浴场入口', shoreline: '海润豪景对面海水浴场岸段，以现场开放区域为限', direction: '从海涛二路一侧进入，仅在平缓近岸和现场允许区域活动', retreat: '回涨前返回海涛二路一侧，浴场关闭或出现警戒时立即结束' },
  { id: 'penglai-bath-nearby', name: '蓬莱海水浴场（仙境路附近）', area: '蓬莱区', latitude: 37.820125, longitude: 120.766869, type: '沙滩', harvest: '贝类 · 小螃蟹', verification: '附近导航点已核验', terrainSafety: 18, entry: '仙境路2号附近导航参考点，并非浴场入口', shoreline: '仙境路北侧海滩方向，实际下滩口以现场公开通道为准', direction: '到达参考点后沿公开步道寻找现场开放入口，不跨越景区或管理边界', retreat: '回涨前返回仙境路一侧，遇封闭、警戒或收费管理区域立即停止' }
]


spots.push(
  { id: 'laizhou-golden-coast', cityId: 'yantai', cityName: '烟台', name: '莱州黄金海岸（附近）', area: '莱州市', latitude: 37.295, longitude: 119.91, type: '沙滩', harvest: '蛤蜊 · 小螃蟹', verification: '公开资料待复核', terrainSafety: 18, ...pendingGuide },
  { id: 'zhaoyuan-golden-coast', cityId: 'yantai', cityName: '烟台', name: '招远滨海岸段（附近）', area: '招远市', latitude: 37.58, longitude: 120.18, type: '沙滩', harvest: '贝类 · 小螃蟹', verification: '公开资料待复核', terrainSafety: 17, ...pendingGuide },
  { id: 'laiyang-dingzi-bay', cityId: 'yantai', cityName: '烟台', name: '丁字湾滨海岸段（附近）', area: '莱阳市', latitude: 36.71, longitude: 120.96, type: '泥沙滩', harvest: '蛤蜊 · 蛏子', verification: '公开资料待复核', terrainSafety: 14, ...pendingGuide },
  { id: 'changdao-yueya-bay', cityId: 'yantai', cityName: '烟台', name: '长岛月牙湾（景区附近）', area: '长岛综试区', latitude: 37.993, longitude: 120.704, type: '卵石滩', harvest: '海螺 · 小螃蟹', verification: '公开资料待复核', terrainSafety: 14, ...pendingGuide },

  { id: 'qingdao-shilaoren', cityId: 'qingdao', cityName: '青岛', name: '石老人海水浴场（附近）', area: '崂山区', latitude: 36.09231, longitude: 120.47021, type: '沙滩 + 礁石', harvest: '海螺 · 小螃蟹', verification: '附近导航点已核验', terrainSafety: 15, entry: '海口路287号附近导航点', shoreline: '石老人海水浴场公开岸段，以浴场开放边界为准', direction: '优先在公开沙滩活动，不攀爬离岸礁石', retreat: '听从浴场旗语和管理提示，回涨前离开低位礁石' },
  { id: 'qingdao-jinshatan', cityId: 'qingdao', cityName: '青岛', name: '青岛金沙滩（附近）', area: '西海岸新区', latitude: 35.9609, longitude: 120.2417, type: '沙滩', harvest: '蛤蜊 · 小螃蟹', verification: '附近导航点已核验', terrainSafety: 18, entry: '金沙滩旅游度假区附近导航点', shoreline: '公开海水浴场岸段，以景区当日开放范围为准', direction: '只在平缓近岸与公开区域活动', retreat: '回涨前返回固定岸线，服从浴场管理' },
  { id: 'qingdao-third-bath', cityId: 'qingdao', cityName: '青岛', name: '第三海水浴场', area: '市南区', latitude: 36.0588, longitude: 120.37, type: '沙滩', harvest: '小螃蟹 · 海螺', verification: '公开资料待复核', terrainSafety: 17, ...pendingGuide },
  { id: 'qingdao-yangkou', cityId: 'qingdao', cityName: '青岛', name: '仰口海水浴场（附近）', area: '崂山区', latitude: 36.239, longitude: 120.68, type: '沙滩', harvest: '贝类 · 小螃蟹', verification: '公开资料待复核', terrainSafety: 17, ...pendingGuide },
  { id: 'qingdao-tianheng', cityId: 'qingdao', cityName: '青岛', name: '田横岛度假区岸段（附近）', area: '即墨区', latitude: 36.424, longitude: 120.987, type: '礁石 + 沙滩', harvest: '海螺 · 螃蟹', verification: '公开资料待复核', terrainSafety: 14, ...pendingGuide },

  { id: 'weihai-international', cityId: 'weihai', cityName: '威海', name: '威海国际海水浴场', area: '环翠区', latitude: 37.527543, longitude: 122.042078, type: '沙滩', harvest: '蛤蜊 · 小螃蟹', verification: 'POI坐标已核验', terrainSafety: 18, entry: '北环海路178号公共入口', shoreline: '国际海水浴场公开岸段，以当日旗语和管理区域为准', direction: '只在公开沙滩和退潮裸露近岸活动', retreat: '回涨前返回固定岸线，遇红旗立即停止' },
  { id: 'weihai-xiaoshidao', cityId: 'weihai', cityName: '威海', name: '小石岛海水浴场（附近）', area: '环翠区', latitude: 37.55, longitude: 122.006, type: '沙滩 + 礁石', harvest: '蛏子 · 小螃蟹', verification: '公开资料待复核', terrainSafety: 15, ...pendingGuide },
  { id: 'weihai-naxianghai', cityId: 'weihai', cityName: '威海', name: '那香海钻石沙滩（附近）', area: '荣成市', latitude: 37.356, longitude: 122.61, type: '沙滩', harvest: '贝类 · 小螃蟹', verification: '公开资料待复核', terrainSafety: 18, ...pendingGuide },
  { id: 'weihai-yintan', cityId: 'weihai', cityName: '威海', name: '乳山银滩海洋公园（附近）', area: '乳山市', latitude: 36.841, longitude: 121.695, type: '沙滩', harvest: '蛤蜊 · 贝类', verification: '公开资料待复核', terrainSafety: 18, ...pendingGuide },
  { id: 'weihai-nanhai', cityId: 'weihai', cityName: '威海', name: '南海公园（附近）', area: '文登区', latitude: 36.969, longitude: 121.866, type: '沙滩', harvest: '贝类 · 小螃蟹', verification: '公开资料待复核', terrainSafety: 18, ...pendingGuide },

  { id: 'rizhao-wanpingkou', cityId: 'rizhao', cityName: '日照', name: '万平口海滨风景区（3号停车场附近）', area: '东港区', latitude: 35.424022, longitude: 119.569466, type: '沙滩', harvest: '贝类 · 小螃蟹', verification: '附近导航点已核验', terrainSafety: 18, entry: '海曲东路398号万平口3号停车场附近', shoreline: '万平口公开沙滩岸段，以景区开放边界为准', direction: '从公开入口进入，不跨越游泳区和管理隔离', retreat: '浪大、红旗或景区关闭时不下滩' },
  { id: 'rizhao-renjiatai', cityId: 'rizhao', cityName: '日照', name: '任家台礁石公园（附近）', area: '山海天旅游度假区', latitude: 35.542, longitude: 119.616, type: '礁石', harvest: '海螺 · 小螃蟹', verification: '公开资料待复核', terrainSafety: 13, ...pendingGuide },
  { id: 'rizhao-forest-park', cityId: 'rizhao', cityName: '日照', name: '海滨国家森林公园沙滩（附近）', area: '东港区', latitude: 35.555, longitude: 119.632, type: '沙滩', harvest: '贝类 · 小螃蟹', verification: '公开资料待复核', terrainSafety: 18, ...pendingGuide },
  { id: 'rizhao-duodao', cityId: 'rizhao', cityName: '日照', name: '多岛海赶海园（附近）', area: '岚山区', latitude: 35.119, longitude: 119.374, type: '礁石 + 沙滩', harvest: '海螺 · 螃蟹', verification: '公开资料待复核', terrainSafety: 14, ...pendingGuide },

  { id: 'weifang-happy-sea', cityId: 'weifang', cityName: '潍坊', name: '欢乐海沙滩景区（附近）', area: '滨海区', latitude: 37.12, longitude: 119.235, type: '沙滩', harvest: '贝类 · 小螃蟹', verification: '公开资料待复核', terrainSafety: 17, ...pendingGuide },
  { id: 'weifang-yangkou', cityId: 'weifang', cityName: '潍坊', name: '羊口港滨海岸段（附近）', area: '寿光市', latitude: 37.24, longitude: 118.95, type: '泥沙滩', harvest: '蛤蜊 · 蛏子', verification: '公开资料待复核', terrainSafety: 12, ...pendingGuide },
  { id: 'weifang-xiaying', cityId: 'weifang', cityName: '潍坊', name: '下营滨海岸段（附近）', area: '昌邑市', latitude: 37.08, longitude: 119.55, type: '泥沙滩', harvest: '蛤蜊 · 小螃蟹', verification: '公开资料待复核', terrainSafety: 12, ...pendingGuide },

  { id: 'dongying-estuary', cityId: 'dongying', cityName: '东营', name: '黄河口生态旅游区（附近）', area: '垦利区', latitude: 37.76, longitude: 119.13, type: '河口湿地', harvest: '仅观察，不采集', verification: '公开资料待复核', terrainSafety: 8, ...pendingGuide },
  { id: 'dongying-red-beach', cityId: 'dongying', cityName: '东营', name: '红滩湿地岸段（附近）', area: '垦利区', latitude: 37.66, longitude: 118.98, type: '湿地', harvest: '仅观察，不采集', verification: '公开资料待复核', terrainSafety: 8, ...pendingGuide },
  { id: 'dongying-gudao', cityId: 'dongying', cityName: '东营', name: '孤岛滨海岸段（附近）', area: '河口区', latitude: 37.86, longitude: 118.82, type: '泥滩', harvest: '蛤蜊 · 小螃蟹', verification: '公开资料待复核', terrainSafety: 10, ...pendingGuide },

  { id: 'binzhou-shell-dike', cityId: 'binzhou', cityName: '滨州', name: '贝壳堤岛湿地（附近）', area: '无棣县', latitude: 38.1, longitude: 118.02, type: '湿地 + 贝壳堤', harvest: '仅观察，不采集', verification: '公开资料待复核', terrainSafety: 8, ...pendingGuide },
  { id: 'binzhou-zhanhua-coast', cityId: 'binzhou', cityName: '滨州', name: '沾化滨海湿地岸段（附近）', area: '沾化区', latitude: 38.02, longitude: 118.16, type: '泥滩 + 湿地', harvest: '仅观察，不采集', verification: '公开资料待复核', terrainSafety: 8, ...pendingGuide }
)


spots.push(
  { id: 'yantai-zhifu-island-east', cityId: 'yantai', cityName: '烟台', name: '芝罘岛东口岸段（附近）', area: '芝罘区', latitude: 37.615, longitude: 121.405, type: '礁石 + 沙滩', harvest: '海螺 · 小螃蟹', verification: '公开资料待复核', terrainSafety: 13, ...pendingGuide },
  { id: 'yantai-yuniao-estuary', cityId: 'yantai', cityName: '烟台', name: '鱼鸟河入海口（附近）', area: '牟平区', latitude: 37.422, longitude: 121.611, type: '河口沙滩', harvest: '蛤蜊 · 小螃蟹', verification: '公开资料待复核', terrainSafety: 13, ...pendingGuide },
  { id: 'yantai-haiyang-lianli', cityId: 'yantai', cityName: '烟台', name: '海阳连理岛岸段（附近）', area: '海阳市', latitude: 36.684, longitude: 121.16, type: '沙滩', harvest: '贝类 · 小螃蟹', verification: '公开资料待复核', terrainSafety: 17, ...pendingGuide },
  { id: 'yantai-sanshan-island', cityId: 'yantai', cityName: '烟台', name: '三山岛滨海岸段（附近）', area: '莱州市', latitude: 37.31, longitude: 119.79, type: '沙滩 + 礁石', harvest: '海螺 · 小螃蟹', verification: '公开资料待复核', terrainSafety: 13, ...pendingGuide },
  { id: 'yantai-jiuzhangya', cityId: 'yantai', cityName: '烟台', name: '长岛九丈崖岸段（景区附近）', area: '长岛综试区', latitude: 38.012, longitude: 120.681, type: '海蚀崖 + 礁石', harvest: '仅观察，不采集', verification: '公开资料待复核', terrainSafety: 8, ...pendingGuide },
  { id: 'yantai-kunyu-bay', cityId: 'yantai', cityName: '烟台', name: '昆嵛山南麓滨海岸段（附近）', area: '牟平区', latitude: 37.37, longitude: 121.75, type: '沙滩 + 礁石', harvest: '海螺 · 小螃蟹', verification: '公开资料待复核', terrainSafety: 13, ...pendingGuide },

  { id: 'qingdao-first-bath', cityId: 'qingdao', cityName: '青岛', name: '第一海水浴场', area: '市南区', latitude: 36.0588, longitude: 120.339, type: '沙滩', harvest: '贝类 · 小螃蟹', verification: '公开资料待复核', terrainSafety: 17, ...pendingGuide },
  { id: 'qingdao-second-bath', cityId: 'qingdao', cityName: '青岛', name: '第二海水浴场', area: '市南区', latitude: 36.056, longitude: 120.36, type: '沙滩 + 礁石', harvest: '海螺 · 小螃蟹', verification: '公开资料待复核', terrainSafety: 15, ...pendingGuide },
  { id: 'qingdao-sixth-bath', cityId: 'qingdao', cityName: '青岛', name: '第六海水浴场（栈桥附近）', area: '市南区', latitude: 36.063, longitude: 120.312, type: '沙滩', harvest: '小螃蟹 · 海螺', verification: '公开资料待复核', terrainSafety: 15, ...pendingGuide },
  { id: 'qingdao-yinshatan', cityId: 'qingdao', cityName: '青岛', name: '银沙滩海水浴场（附近）', area: '西海岸新区', latitude: 35.953, longitude: 120.21, type: '沙滩', harvest: '蛤蜊 · 小螃蟹', verification: '公开资料待复核', terrainSafety: 17, ...pendingGuide },
  { id: 'qingdao-tangdaowan', cityId: 'qingdao', cityName: '青岛', name: '唐岛湾滨海公园岸段（附近）', area: '西海岸新区', latitude: 35.949, longitude: 120.188, type: '沙滩 + 湿地', harvest: '小螃蟹 · 贝类', verification: '公开资料待复核', terrainSafety: 14, ...pendingGuide },
  { id: 'qingdao-lingshan-bay', cityId: 'qingdao', cityName: '青岛', name: '灵山湾海水浴场（附近）', area: '西海岸新区', latitude: 35.881, longitude: 120.045, type: '沙滩', harvest: '贝类 · 小螃蟹', verification: '公开资料待复核', terrainSafety: 17, ...pendingGuide },
  { id: 'qingdao-hongdao', cityId: 'qingdao', cityName: '青岛', name: '红岛休闲渔村岸段（附近）', area: '城阳区', latitude: 36.235, longitude: 120.22, type: '泥沙滩', harvest: '蛤蜊 · 蛏子', verification: '公开资料待复核', terrainSafety: 12, ...pendingGuide },
  { id: 'qingdao-xiaomaidao', cityId: 'qingdao', cityName: '青岛', name: '小麦岛公园岸段（附近）', area: '崂山区', latitude: 36.057, longitude: 120.433, type: '礁石', harvest: '海螺 · 小螃蟹', verification: '公开资料待复核', terrainSafety: 12, ...pendingGuide },
  { id: 'qingdao-aoshan-bay', cityId: 'qingdao', cityName: '青岛', name: '鳌山湾滨海岸段（附近）', area: '即墨区', latitude: 36.374, longitude: 120.72, type: '沙滩 + 礁石', harvest: '海螺 · 蛤蜊', verification: '公开资料待复核', terrainSafety: 13, ...pendingGuide },
  { id: 'qingdao-nvdao', cityId: 'qingdao', cityName: '青岛', name: '女岛滨海岸段（附近）', area: '即墨区', latitude: 36.366, longitude: 120.86, type: '礁石 + 沙滩', harvest: '海螺 · 螃蟹', verification: '公开资料待复核', terrainSafety: 12, ...pendingGuide },

  { id: 'weihai-banyuewan', cityId: 'weihai', cityName: '威海', name: '半月湾海水浴场（附近）', area: '环翠区', latitude: 37.533, longitude: 122.145, type: '沙滩', harvest: '贝类 · 小螃蟹', verification: '公开资料待复核', terrainSafety: 17, ...pendingGuide },
  { id: 'weihai-putaotan', cityId: 'weihai', cityName: '威海', name: '葡萄滩海水浴场（附近）', area: '环翠区', latitude: 37.548, longitude: 122.116, type: '沙滩 + 礁石', harvest: '海螺 · 小螃蟹', verification: '公开资料待复核', terrainSafety: 15, ...pendingGuide },
  { id: 'weihai-haiyuan', cityId: 'weihai', cityName: '威海', name: '海源公园岸段（附近）', area: '环翠区', latitude: 37.524, longitude: 122.133, type: '礁石', harvest: '海螺 · 小螃蟹', verification: '公开资料待复核', terrainSafety: 12, ...pendingGuide },
  { id: 'weihai-sea-park', cityId: 'weihai', cityName: '威海', name: '海上公园沙滩（附近）', area: '经开区', latitude: 37.421, longitude: 122.169, type: '沙滩 + 泻湖', harvest: '蛤蜊 · 小螃蟹', verification: '公开资料待复核', terrainSafety: 15, ...pendingGuide },
  { id: 'weihai-yuehai', cityId: 'weihai', cityName: '威海', name: '悦海公园灯塔岸段（附近）', area: '经开区', latitude: 37.405, longitude: 122.168, type: '礁石 + 沙滩', harvest: '海星 · 小螃蟹', verification: '公开资料待复核', terrainSafety: 13, ...pendingGuide },
  { id: 'weihai-jiulongwan', cityId: 'weihai', cityName: '威海', name: '九龙湾公园岸段（附近）', area: '经开区', latitude: 37.392, longitude: 122.184, type: '沙滩', harvest: '蛤蜊 · 小螃蟹', verification: '公开资料待复核', terrainSafety: 15, ...pendingGuide },
  { id: 'weihai-shidaowan', cityId: 'weihai', cityName: '威海', name: '石岛湾滨海岸段（附近）', area: '荣成市', latitude: 36.91, longitude: 122.43, type: '沙滩 + 礁石', harvest: '海螺 · 小螃蟹', verification: '公开资料待复核', terrainSafety: 13, ...pendingGuide },
  { id: 'weihai-sanggouwan', cityId: 'weihai', cityName: '威海', name: '桑沟湾滨海岸段（附近）', area: '荣成市', latitude: 37.05, longitude: 122.52, type: '沙滩 + 养殖湾', harvest: '贝类 · 小螃蟹', verification: '公开资料待复核', terrainSafety: 11, ...pendingGuide },
  { id: 'weihai-chengshantou', cityId: 'weihai', cityName: '威海', name: '成山头岸段（景区附近）', area: '荣成市', latitude: 37.392, longitude: 122.704, type: '海蚀崖 + 礁石', harvest: '仅观察，不采集', verification: '公开资料待复核', terrainSafety: 8, ...pendingGuide },
  { id: 'weihai-darushan', cityId: 'weihai', cityName: '威海', name: '大乳山滨海岸段（附近）', area: '乳山市', latitude: 36.801, longitude: 121.53, type: '沙滩 + 礁石', harvest: '贝类 · 小螃蟹', verification: '公开资料待复核', terrainSafety: 13, ...pendingGuide },

  { id: 'rizhao-taigongdao', cityId: 'rizhao', cityName: '日照', name: '太公岛牡蛎公园（附近）', area: '东港区', latitude: 35.461, longitude: 119.592, type: '礁石', harvest: '海蛎子 · 小螃蟹', verification: '公开资料待复核', terrainSafety: 12, ...pendingGuide },
  { id: 'rizhao-liujiawan', cityId: 'rizhao', cityName: '日照', name: '刘家湾赶海园（附近）', area: '东港区', latitude: 35.286, longitude: 119.409, type: '泥沙滩', harvest: '蛤蜊 · 蛏子', verification: '公开资料待复核', terrainSafety: 14, ...pendingGuide },
  { id: 'rizhao-zhangjiatai', cityId: 'rizhao', cityName: '日照', name: '张家台礁石岸段（附近）', area: '山海天旅游度假区', latitude: 35.501, longitude: 119.606, type: '礁石', harvest: '海螺 · 小螃蟹', verification: '公开资料待复核', terrainSafety: 11, ...pendingGuide },
  { id: 'rizhao-feijiazhuang', cityId: 'rizhao', cityName: '日照', name: '肥家庄海滨岸段（附近）', area: '山海天旅游度假区', latitude: 35.483, longitude: 119.601, type: '沙滩 + 礁石', harvest: '海螺 · 贝类', verification: '公开资料待复核', terrainSafety: 13, ...pendingGuide },
  { id: 'rizhao-taohuadao', cityId: 'rizhao', cityName: '日照', name: '桃花岛风情园岸段（附近）', area: '山海天旅游度假区', latitude: 35.49, longitude: 119.614, type: '礁石 + 沙滩', harvest: '海螺 · 小螃蟹', verification: '公开资料待复核', terrainSafety: 12, ...pendingGuide },
  { id: 'rizhao-dashawa', cityId: 'rizhao', cityName: '日照', name: '大沙洼海滨岸段（附近）', area: '东港区', latitude: 35.56, longitude: 119.63, type: '沙滩', harvest: '贝类 · 小螃蟹', verification: '公开资料待复核', terrainSafety: 17, ...pendingGuide },

  { id: 'weifang-bailang-estuary', cityId: 'weifang', cityName: '潍坊', name: '白浪河入海口岸段（附近）', area: '滨海区', latitude: 37.154, longitude: 119.17, type: '河口泥滩', harvest: '蛤蜊 · 小螃蟹', verification: '公开资料待复核', terrainSafety: 10, ...pendingGuide },
  { id: 'weifang-port-coast', cityId: 'weifang', cityName: '潍坊', name: '潍坊港滨海岸段（附近）', area: '滨海区', latitude: 37.195, longitude: 119.08, type: '港区岸线', harvest: '仅观察，不采集', verification: '公开资料待复核', terrainSafety: 7, ...pendingGuide },
  { id: 'weifang-linhai', cityId: 'weifang', cityName: '潍坊', name: '寿光林海岸段（附近）', area: '寿光市', latitude: 37.17, longitude: 118.9, type: '泥滩 + 湿地', harvest: '仅观察，不采集', verification: '公开资料待复核', terrainSafety: 8, ...pendingGuide },
  { id: 'weifang-changyi-coast', cityId: 'weifang', cityName: '潍坊', name: '昌邑北部滨海岸段（附近）', area: '昌邑市', latitude: 37.13, longitude: 119.54, type: '泥滩', harvest: '蛤蜊 · 小螃蟹', verification: '公开资料待复核', terrainSafety: 10, ...pendingGuide },

  { id: 'dongying-guangli-estuary', cityId: 'dongying', cityName: '东营', name: '广利河入海口岸段（附近）', area: '东营区', latitude: 37.57, longitude: 119.15, type: '河口湿地', harvest: '仅观察，不采集', verification: '公开资料待复核', terrainSafety: 8, ...pendingGuide },
  { id: 'dongying-lijin-wetland', cityId: 'dongying', cityName: '东营', name: '利津滨海湿地岸段（附近）', area: '利津县', latitude: 37.78, longitude: 118.65, type: '湿地 + 泥滩', harvest: '仅观察，不采集', verification: '公开资料待复核', terrainSafety: 7, ...pendingGuide },
  { id: 'dongying-guangrao-coast', cityId: 'dongying', cityName: '东营', name: '广饶东北部滨海岸段（附近）', area: '广饶县', latitude: 37.36, longitude: 118.96, type: '盐碱湿地', harvest: '仅观察，不采集', verification: '公开资料待复核', terrainSafety: 7, ...pendingGuide },

  { id: 'binzhou-port-nearby', cityId: 'binzhou', cityName: '滨州', name: '滨州港岸段（附近）', area: '无棣县', latitude: 38.18, longitude: 118.04, type: '港区岸线', harvest: '仅观察，不采集', verification: '公开资料待复核', terrainSafety: 7, ...pendingGuide },
  { id: 'binzhou-taoer-estuary', cityId: 'binzhou', cityName: '滨州', name: '套尔河入海口岸段（附近）', area: '沾化区', latitude: 38.05, longitude: 118.25, type: '河口湿地', harvest: '仅观察，不采集', verification: '公开资料待复核', terrainSafety: 7, ...pendingGuide }
)

function harvestAssessment(spot, reports) {
  const item = (reports || []).find(report => report.spotId === spot.id)
  const count = Number(item && item.count || 0)
  const average = Number(item && item.average || 0)
  if (count < 5) return { count, label: '样本不足', score: null, confidence: '无' }
  const label = average < 1.75 ? '偏少' : average < 2.75 ? '一般' : '较好'
  if (count < 20) return { count, label, score: null, confidence: '低' }
  return { count, label, score: Math.round(Math.min(100, average / 4 * 100)), confidence: count < 50 ? '中' : '高' }
}

function regionKey(item) {
  const latitude = Number(item.latitude)
  const longitude = Number(item.longitude)
  if (latitude >= 37.88) return 'changdaoSouth'
  if (latitude <= 36.9) return 'haiyang'
  if (longitude <= 120.25) return 'laizhou'
  if (longitude <= 120.58) return 'longkou'
  if (longitude <= 120.95) return 'penglai'
  if (longitude <= 121.32) return 'development'
  if (longitude >= 121.58) return 'muping'
  return 'zhifu'
}

function tideWindowFromLow(time) {
  const match = String(time || '').match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const minutes = Number(match[1]) * 60 + Number(match[2])
  if (!Number.isFinite(minutes)) return null
  const format = value => String(Math.floor(value / 60)).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0')
  return format(Math.max(0, minutes - 120)) + '—' + format(Math.min(1439, minutes + 30))
}

function getSpots(location, conditions, reports, cityId) {
  const selectedCityId = cityId || 'yantai'
  return spots.filter(item => (item.cityId || 'yantai') === selectedCityId).map(item => {
    const km = distanceKm(location, item)
    const itemCityId = item.cityId || 'yantai'
    const localConditions = itemCityId === selectedCityId
      ? (selectedCityId === 'yantai' ? (conditions && conditions.regions && conditions.regions[regionKey(item)] || conditions) : conditions)
      : { dataReady: false, blocked: false }
    const verified = item.verification === 'POI坐标已核验' || item.verification === '附近导航点已核验'
    const scoreable = Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude))
    const safetyScore = scoreable ? safetyScoreWithConditions(item.terrainSafety, localConditions) : null
    const harvest = harvestAssessment(item, reports)
    const recommended = verified && safetyScore !== null && safetyScore >= 80 && harvest.score !== null
    const lowTide = localConditions && localConditions.nextLow ? localConditions.nextLow : '--:--'
    const officialWindow = localConditions && localConditions.window
    const estimatedWindow = !officialWindow && lowTide !== '--:--' ? tideWindowFromLow(lowTide) : null
    const window = officialWindow || estimatedWindow || (localConditions && localConditions.dataReady ? '今日低潮窗口已过' : '潮汐数据待更新')
    const windowBasis = officialWindow ? '官方潮汐窗口' : estimatedWindow ? '按低潮前2小时至后30分钟估算' : localConditions && localConditions.dataReady ? '今日窗口已结束' : '等待官方潮汐数据'
    const guide = positionGuides[item.id] || { shoreSide: item.shoreline, offshoreRange: '仅限退潮后裸露的近岸区域' }
    const distanceScore = km === null ? 50 : Math.max(0, 100 - km * 2)
    const rankScore = Math.round(Number(safetyScore || 0) * 0.6 + distanceScore * 0.35 + (verified ? 5 : 0))
    const catchForecast = harvest.count < 5
      ? '目标海货：' + item.harvest + '；现场样本不足，暂不预测数量'
      : '预测海货：' + item.harvest + '；近14天趋势' + harvest.label + '（' + harvest.confidence + '置信）'
    return Object.assign({}, item, {
      cityId: item.cityId || 'yantai',
      cityName: item.cityName || '烟台',
      score: safetyScore,
      safetyScore,
      harvestScore: harvest.score,
      harvestLabel: harvest.label,
      confidence: harvest.confidence,
      sampleCount: harvest.count,
      catchForecast,
      shoreSide: guide.shoreSide,
      offshoreRange: guide.offshoreRange,
      rankScore,
      rankReason: (km === null ? '未定位' : formatDistance(km)) + ' · 安全' + (safetyScore === null ? '待更新' : safetyScore + '分') + ' · 距离与安全综合排序',
      recommended,
      level: recommended ? '达到推荐门槛' : safetyScore !== null ? scoreLabel(safetyScore) + (verified ? '' : ' · 地点待核验') : item.verification,
      distance: km === null ? null : Number(km.toFixed(1)),
      distanceLabel: formatDistance(km),
      tide: lowTide === '--:--' ? '潮汐待更新' : '下一低潮 ' + lowTide,
      bestWindow: window,
      windowBasis,
      weather: localConditions && localConditions.weatherLabel || '天气待更新',
      tideRange: localConditions && localConditions.waveLabel || '海况待更新',
      update: localConditions && localConditions.dataReady ? '实时海况' : '等待实时数据',
      tags: [item.type, item.verification, item.harvest],
      species: item.harvest.split(' · ').slice(0, 3).map((name, index) => ({ name, mark: name.slice(0, 1), value: harvest.label, tone: index === 0 ? 'warm' : 'cool' })),
      zone: { side: item.direction, distance: item.shoreline, reason: item.entry },
      risk: item.type.indexOf('礁石') >= 0 ? '中' : '低',
      safety: item.retreat,
      note: '收获判断只使用近14天现场定位通过的样本'
    })
  }).sort((a, b) => {
    if (a.rankScore !== b.rankScore) return b.rankScore - a.rankScore
    if (a.recommended !== b.recommended) return a.recommended ? -1 : 1
    return Number(a.distance || 999) - Number(b.distance || 999)
  })
}

function getSpot(id) {
  return spots.find(item => item.id === id) || spots[0]
}

function getTodaySummary() {
  return {
    score: null,
    safetyScore: null,
    label: '实时数据待更新',
    safetyLevel: '实时数据待更新',
    subtitle: '官方潮汐或实时天气未通过校验时，系统停止推荐',
    lowTide: '--:--',
    weather: '待更新',
    wind: '待更新',
    tideRange: '待更新',
    bestTime: '暂不可计算',
    safety: '请稍后下拉刷新，不使用过期数据',
    updatedAt: new Date().toLocaleString(),
    dataReady: false,
    conditions: { dataReady: false, blocked: false }
  }
}

module.exports = { cities, spots, getSpots, getSpot, getTodaySummary, harvestAssessment }
