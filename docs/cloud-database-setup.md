# 云数据库配置

部署新版云函数前，在当前云环境创建以下集合：

- `field_reports`：匿名结构化现场样本
- `spot_feedback`：地点纠错反馈
- `forecast_cache`：各城市最近一次有效海况

建议为 `field_reports` 创建复合索引：

1. `cityId` 升序、`createdAt` 降序：用于按城市管理样本。
2. `verified` 升序、`createdAt` 降序：用于近14天真实样本统计。
3. `_openid` 升序、`createdAt` 降序：用于限制重复提交样本。

建议为 `spot_feedback` 创建 `_openid` 升序、`createdAt` 降序复合索引，用于限制重复反馈。

没有复合索引时云函数会使用兼容分页查询，但数据量增大后性能会下降。

`field_reports` 会新增以下字段，无需新建集合：

- `zoneId`、`zoneLabel`：用户粗略选择的参考点西侧、附近或东侧。
- `verified`、`verificationLabel`：是否通过现场距离与定位精度核验。

赶海圈公开图文由微信官方组件处理，不写入 `field_reports`。统计仅使用 `verified: true` 的结构化记录。
