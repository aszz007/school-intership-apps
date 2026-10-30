# 晴窗城市天气查询

在仓库根目录运行`python tools/serve.py`，打开http://127.0.0.1:4173/weather/。应用启动后不自动显示示例天气，由用户点击城市或输入名称触发真实请求。

调用Open-Meteo Forecast和Geocoding公共接口，不需要API密钥。热门城市使用明确经纬度，其他城市显示省份、国家与候选。大连使用辽宁大连坐标38.91222、121.60222，避免同名小地点误匹配。

当前天气为气象模型估计，显示数据时间和三天预报。使用独立取消控制器、15秒超时、请求序号和响应校验；失败隐藏旧结果，最近6个成功城市保存在city-weather.history.v1中。网络条件会影响查询，失败会明确提示。

官方接口说明：https://open-meteo.com/en/docs 和 https://open-meteo.com/en/docs/geocoding-api 。页面标明Open-Meteo来源及CC BY 4.0许可。大连坐标参考https://www.geonames.org/search.html?country=CN 。

秒哒正式网址：https://app-f1o8xoy9m135.miaoda.online。本目录为独立可运行源码，不是平台源码导出。
