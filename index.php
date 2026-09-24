<?php
require_once __DIR__ . '/includes/functions.php';
require_once __DIR__ . '/config/database.php';

$pageTitle = '社区便民留言板 - 首页';
$currentPage = 'home';
$cssPath = 'assets/css/style.css';
$jsPath = 'assets/js/main.js';

$db = getDB();

// 获取排序参数（白名单校验，避免非法值进入SQL/链接）
$sort = ($_GET['sort'] ?? 'time') === 'hot' ? 'hot' : 'time';
$type = in_array($_GET['type'] ?? '', ['help', 'suggest', 'lost'], true) ? $_GET['type'] : '';
$page = max(1, intval($_GET['page'] ?? 1));
$pageSize = 10;

// 构建查询条件：统计、滚动、列表共用同一份过滤结果
$where = "WHERE status = 1";
$params = [];

if ($type) {
    $where .= " AND type = ?";
    $params[] = $type;
}

// 排序：热度相同时以 id 决胜，时间相同时同样以 id 决胜，
// 保证翻页、刷新、不同入口之间顺序与序号完全稳定
$orderBy = ($sort === 'hot')
    ? "views DESC, id DESC"
    : "created_at DESC, id DESC";

// 总数（与列表同一过滤口径）
$countStmt = $db->prepare("SELECT COUNT(*) FROM messages $where");
$countStmt->execute($params);
$total = (int) $countStmt->fetchColumn();
$totalPages = max(1, (int) ceil($total / $pageSize));

// 删除留言后可能停留在超出范围的页码，统一回到最后一页
if ($page > $totalPages) {
    header('Location: ' . buildUrl(['sort' => $sort, 'type' => $type, 'page' => $totalPages]));
    exit;
}
$offset = ($page - 1) * $pageSize;

// 列表
$sql = "SELECT id, nickname, type, title, content, image, views, created_at FROM messages $where ORDER BY $orderBy LIMIT $pageSize OFFSET $offset";
$stmt = $db->prepare($sql);
$stmt->execute($params);
$messages = $stmt->fetchAll();

// 获取当前用户已收藏的留言ID
$favoritedIds = getFavoritedMessageIds();
$favoritedIds = array_flip($favoritedIds);

// 滚动数据：与当前分类过滤结果一致，取该结果集最新8条
$scrollStmt = $db->prepare("SELECT id, type, title, created_at FROM messages $where ORDER BY created_at DESC, id DESC LIMIT 8");
$scrollStmt->execute($params);
$scrollMessages = $scrollStmt->fetchAll();

// 统计：总数沿用当前过滤结果；各分类卡片始终给出全局分类数量，便于跨分类切换
$stats = [
    'total' => $total,
    'help_count' => 0,
    'suggest_count' => 0,
    'lost_count' => 0,
];
$globalStatsStmt = $db->query("SELECT type, COUNT(*) AS cnt FROM messages WHERE status = 1 GROUP BY type");
foreach ($globalStatsStmt->fetchAll() as $row) {
    $stats[$row['type'] . '_count'] = (int) $row['cnt'];
}

include __DIR__ . '/includes/header.php';
?>

<!-- 滚动信息栏：仅在当前过滤条件下有留言时展示 -->
<?php if (!empty($scrollMessages)): ?>
<div class="scroll-bar">
    <div class="container">
        <span class="scroll-label">📢 <?= $type ? getTypeLabel($type) . '动态' : '最新动态' ?></span>
        <div class="scroll-wrapper">
            <div class="scroll-content" id="scrollContent">
                <?php foreach ($scrollMessages as $msg): ?>
                <a href="detail.php?id=<?= $msg['id'] ?>&back=<?= urlencode(buildUrl(['sort' => $sort, 'type' => $type, 'page' => $page])) ?>" class="scroll-item">
                    <span class="scroll-type"><?= getTypeIcon($msg['type']) ?></span>
                    <span class="scroll-title"><?= cleanInput($msg['title']) ?></span>
                    <span class="scroll-time"><?= timeAgo($msg['created_at']) ?></span>
                </a>
                <?php endforeach; ?>
            </div>
        </div>
    </div>
</div>
<?php endif; ?>

<!-- 统计卡片：与标签筛选互为入口，链接参数完全一致 -->
<section class="stats-section">
    <div class="container">
        <div class="stats-grid">
            <a href="<?= buildUrl(['sort' => $sort]) ?>" class="stat-card <?= !$type ? 'active' : '' ?>">
                <div class="stat-number"><?= $stats['total'] ?></div>
                <div class="stat-label">全部留言</div>
            </a>
            <a href="<?= buildUrl(['sort' => $sort, 'type' => 'help']) ?>" class="stat-card stat-help <?= $type === 'help' ? 'active' : '' ?>">
                <div class="stat-number"><?= $stats['help_count'] ?></div>
                <div class="stat-label">🆘 居民求助</div>
            </a>
            <a href="<?= buildUrl(['sort' => $sort, 'type' => 'suggest']) ?>" class="stat-card stat-suggest <?= $type === 'suggest' ? 'active' : '' ?>">
                <div class="stat-number"><?= $stats['suggest_count'] ?></div>
                <div class="stat-label">💡 意见建议</div>
            </a>
            <a href="<?= buildUrl(['sort' => $sort, 'type' => 'lost']) ?>" class="stat-card stat-lost <?= $type === 'lost' ? 'active' : '' ?>">
                <div class="stat-number"><?= $stats['lost_count'] ?></div>
                <div class="stat-label">🔍 失物招领</div>
            </a>
        </div>
    </div>
</section>

<!-- 筛选和排序 -->
<section class="filter-section">
    <div class="container">
        <div class="filter-bar">
            <div class="filter-types">
                <a href="<?= buildUrl(['sort' => $sort]) ?>" class="filter-tag <?= !$type ? 'active' : '' ?>">全部</a>
                <a href="<?= buildUrl(['sort' => $sort, 'type' => 'help']) ?>" class="filter-tag <?= $type === 'help' ? 'active' : '' ?>">🆘 求助</a>
                <a href="<?= buildUrl(['sort' => $sort, 'type' => 'suggest']) ?>" class="filter-tag <?= $type === 'suggest' ? 'active' : '' ?>">💡 建议</a>
                <a href="<?= buildUrl(['sort' => $sort, 'type' => 'lost']) ?>" class="filter-tag <?= $type === 'lost' ? 'active' : '' ?>">🔍 失物招领</a>
            </div>
            <div class="filter-sort">
                <a href="<?= buildUrl(['sort' => 'time', 'type' => $type]) ?>" class="sort-btn <?= $sort === 'time' ? 'active' : '' ?>">🕐 按时间</a>
                <a href="<?= buildUrl(['sort' => 'hot', 'type' => $type]) ?>" class="sort-btn <?= $sort === 'hot' ? 'active' : '' ?>">🔥 按热度</a>
            </div>
        </div>
    </div>
</section>

<!-- 留言列表 -->
<section class="message-list-section">
    <div class="container">
        <?php if (empty($messages)): ?>
        <div class="empty-state">
            <div class="empty-icon">📭</div>
            <p>暂无留言信息</p>
            <a href="submit.php" class="btn btn-primary">发布第一条留言</a>
        </div>
        <?php else: ?>
        <div class="message-list">
            <?php foreach ($messages as $msg): ?>
            <div class="message-card">
                <a href="detail.php?id=<?= $msg['id'] ?>&back=<?= urlencode(buildUrl(['sort' => $sort, 'type' => $type, 'page' => $page])) ?>" class="card-link">
                    <div class="card-header">
                        <span class="card-type type-<?= $msg['type'] ?>"><?= getTypeIcon($msg['type']) ?> <?= getTypeLabel($msg['type']) ?></span>
                        <span class="card-time"><?= timeAgo($msg['created_at']) ?></span>
                    </div>
                    <h3 class="card-title"><?= cleanInput($msg['title']) ?></h3>
                    <p class="card-content"><?= cleanInput(mb_substr($msg['content'], 0, 80)) ?><?= mb_strlen($msg['content']) > 80 ? '...' : '' ?></p>
                    <div class="card-footer">
                        <span class="card-author">👤 <?= cleanInput($msg['nickname']) ?></span>
                        <?php if ($msg['image']): ?>
                        <span class="card-image">📷 有图</span>
                        <?php endif; ?>
                        <span class="card-views">👁 <?= $msg['views'] ?></span>
                    </div>
                </a>
                <button class="favorite-btn <?= isset($favoritedIds[$msg['id']]) ? 'favorited' : '' ?>" data-message-id="<?= $msg['id'] ?>" onclick="toggleFavorite(event, this)">
                    <span class="favorite-icon"><?= isset($favoritedIds[$msg['id']]) ? '⭐' : '☆' ?></span>
                    <span class="favorite-text"><?= isset($favoritedIds[$msg['id']]) ? '已收藏' : '收藏' ?></span>
                </button>
            </div>
            <?php endforeach; ?>
        </div>

        <!-- 分页 -->
        <?php if ($totalPages > 1): ?>
        <div class="pagination">
            <?php if ($page > 1): ?>
            <a href="<?= buildUrl(['sort' => $sort, 'type' => $type, 'page' => $page - 1]) ?>" class="page-btn">上一页</a>
            <?php endif; ?>
            <?php for ($i = max(1, $page - 2); $i <= min($totalPages, $page + 2); $i++): ?>
            <a href="<?= buildUrl(['sort' => $sort, 'type' => $type, 'page' => $i]) ?>" class="page-btn <?= $i === $page ? 'active' : '' ?>"><?= $i ?></a>
            <?php endfor; ?>
            <?php if ($page < $totalPages): ?>
            <a href="<?= buildUrl(['sort' => $sort, 'type' => $type, 'page' => $page + 1]) ?>" class="page-btn">下一页</a>
            <?php endif; ?>
            <span class="page-info">共 <?= $total ?> 条</span>
        </div>
        <?php endif; ?>
        <?php endif; ?>
    </div>
</section>

<?php include __DIR__ . '/includes/footer.php'; ?>
