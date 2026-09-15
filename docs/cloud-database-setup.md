# 云数据库配置

部署新版云函数前，在当前云环境创建以下集合：

- `field_reports`：赶海圈现场记录
- `spot_feedback`：地点纠错反馈
- `forecast_cache`：各城市最近一次有效海况

建议为 `field_reports` 创建复合索引：

1. `cityId` 升序、`createdAt` 降序：用于按城市读取最新动态。
2. `verified` 升序、`createdAt` 降序：用于近14天真实样本统计。
3. `_openid` 升序、`createdAt` 降序：用于限制重复发布。

建议为 `spot_feedback` 创建 `_openid` 升序、`createdAt` 降序复合索引，用于限制重复反馈。

没有复合索引时云函数会使用兼容分页查询，但数据量增大后性能会下降。

`field_reports` 会新增以下字段，无需新建集合：

- `zoneId`、`zoneLabel`：用户粗略选择的参考点西侧、附近或东侧。
- `photoFileIds`：最多 3 个云存储文件 ID。
- `verified`、`verificationLabel`：是否通过现场距离与定位精度核验。

未核验记录可以在赶海圈展示，但云函数统计预测时只读取 `verified: true` 的记录。
