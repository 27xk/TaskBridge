# TaskBridge 一键部署

`deploy/` 提供面向普通用户和自托管用户的 Docker Compose 部署方式。默认使用 GitHub Container Registry 上的正式镜像，也可以切换到 Docker Hub 镜像。

## 快速启动

```bash
git clone https://github.com/27xk/TaskBridge.git
cd TaskBridge/deploy
cp .env.example .env
docker compose -f docker-compose.release.yml up -d
```

启动后访问：

```text
http://127.0.0.1:8000/health
```

## 镜像来源

默认后端镜像：

```text
ghcr.io/27xk/taskbridge:latest
```

如需使用 Docker Hub，在 `.env` 中改为：

```text
TASKBRIDGE_BACKEND_IMAGE=27xk/taskbridge:latest
```

## 服务

| 服务 | 端口 | 说明 |
| --- | --- | --- |
| `api` | `8000` | TaskBridge 后端 API |
| `mysql` | `3306` | MySQL 数据库 |
| `redis` | `6379` | Redis |

## 配置

复制并修改 `.env`：

```bash
cp .env.example .env
```

生产环境至少要修改：

- `MYSQL_ROOT_PASSWORD`
- `MYSQL_PASSWORD`
- `JWT_SECRET`

如果 `ENVIRONMENT=production`，`JWT_SECRET` 必须是至少 32 位的随机字符串，且数据库密码不能使用默认值。

## 更新

```bash
cd deploy
docker compose -f docker-compose.release.yml pull
docker compose -f docker-compose.release.yml up -d
```

## 查看日志

```bash
docker compose -f docker-compose.release.yml logs -f api
```

## 停止服务

```bash
docker compose -f docker-compose.release.yml down
```

如需删除数据卷：

```bash
docker compose -f docker-compose.release.yml down -v
```
