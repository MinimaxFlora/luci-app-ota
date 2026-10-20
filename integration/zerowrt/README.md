# 给 ZeroWrt 添加在线升级（luci-app-ota）

本文说明如何把 [luci-app-ota](../..) 接入 [ZeroWrt](https://github.com/MinimaxFlora/ZeroWrt)
的 GitHub Actions 构建流程，最终效果：

```
固件编译 → 发布 Release → 生成/更新 ota.json（推送到 ota 分支）
                                     ↓
路由 LuCI：系统 → 在线升级 → 检查更新 → 下载 → 安装（sysupgrade）
```

索引地址（插件默认值）：

```
https://raw.githubusercontent.com/MinimaxFlora/ZeroWrt/ota/ota.json
```

---

## 一、需要改动的三个地方

| # | 文件 | 改动 |
| --- | --- | --- |
| 1 | `scripts/zerowrt_core/configgen.py` | `PACKAGES` 里加 `CONFIG_PACKAGE_luci-app-ota` |
| 2 | `.github/workflows/build.yml` | 加「克隆插件」和「写 OTA 元数据」两步 |
| 3 | `.github/workflows/build.yml` | 发布 Release 之后加「发布索引」一步 |

> 不修改 `packages.py` / `configgen.py` 的其他逻辑，全部用工作流步骤完成，
> 改动最小、最容易回滚。

---


## 直接打补丁

仓库里已经准备好可直接应用的补丁（基于当前 `main` 生成，已用 `git apply --check` 验证）：

```sh
cd /path/to/ZeroWrt

git apply /path/to/luci-app-ota/integration/zerowrt/configgen.py.patch
git apply /path/to/luci-app-ota/integration/zerowrt/build.yml.patch

git diff --stat   # 确认改动
```

如果以后 `build.yml` 改动较多导致补丁打不上，按下面小节里的片段手工插入即可
（三处，都是纯新增，不删除任何现有行）。

## 二、具体补丁

### 1) 选中插件包

`scripts/zerowrt_core/configgen.py`：

```diff
 PACKAGES = [
     "CONFIG_PACKAGE_luci-theme-argon",
     "CONFIG_PACKAGE_luci-app-argon-config",
     "CONFIG_PACKAGE_luci-app-passwall",
     "CONFIG_PACKAGE_luci-app-openclash",
+    "CONFIG_PACKAGE_luci-app-ota",
+    "CONFIG_PACKAGE_luci-i18n-ota-zh-cn",
 ]
```

`luci-i18n-ota-zh-cn` 可选，装了才有简体中文界面（英文界面下功能一致）。

### 2) 克隆插件 + 写入 OTA 元数据

在 `build.yml` 的 **Generate .config 之前**（例如紧跟在
`Add external packages and branding` 之后）加：

```yaml
      - name: Add luci-app-ota
        run: |
          git clone --depth 1 https://github.com/MinimaxFlora/luci-app-ota.git \
            "$LEDE_DIR/package/new/luci-app-ota"
          test -f "$LEDE_DIR/package/new/luci-app-ota/Makefile"
```

在 **Generate .config 之后、Compile firmware 之前**加：

```yaml
      - name: Embed OTA metadata
        run: |
          python3 "$LEDE_DIR/package/new/luci-app-ota/tools/embed_ota_meta.py" \
            --tree "$LEDE_DIR" \
            --info "$LEDE_DIR/.zerowrt-info.json" \
            --dist-name ZeroWrt \
            --emit "$GITHUB_WORKSPACE/ota-meta.json"
```

这一步会：

- 写 `package/base-files/files/etc/ota/build.json`（进镜像，插件用它识别设备和构建时间）；
- 写 `$LEDE_DIR/version.date`，使 `/etc/os-release` 的 `OPENWRT_BUILD_DATE`
  与 `build.json` 里的 `build_date` **完全一致**；
- 把同样的元数据存一份到 `ota-meta.json`，供后面生成索引时使用。

> 为什么要写 `version.date`：OpenWrt 用 `scripts/get_source_date_epoch.sh`
> 计算构建时间，优先读 `TOPDIR/version.date`。不写就退回 git 提交时间，
> 同一个 commit 多次构建会得到相同时间戳，OTA 就无法区分新旧。

### 3) 发布索引

在 `Publish device release` 之后加：

```yaml
      - name: Publish OTA index
        if: success()
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          sh "$LEDE_DIR/package/new/luci-app-ota/tools/publish_ota_index.sh" \
            --repo "$GITHUB_REPOSITORY" \
            --dist dist \
            --meta "$GITHUB_WORKSPACE/ota-meta.json" \
            --tag "$ZEROWRT_DEVICE" \
            --branch ota
```

脚本行为：

1. 尝试 `git clone -b ota`；分支不存在就创建孤儿分支；
2. 读取 `ota.json`（没有就新建），**只更新本设备的条目**，其他设备条目保留；
3. 用 `dist/SHA256SUMS` 填 `sha256`，用 `dist/` 里的文件名拼 Release 资源地址；
4. 有变化才提交并推送，无变化静默退出（不会产生空提交）。

第一次运行后仓库会多出 `ota` 分支，`ota.json` 内容形如：

```json
{
  "schema": 2,
  "generated": 1774124800,
  "dist": "ZeroWrt",
  "devices": {
    "ruijie_rg-x60-new": {
      "version": "20261020",
      "build_date": 1774124635,
      "url": "https://github.com/MinimaxFlora/ZeroWrt/releases/download/ruijie_rg-x60-new/zerowrt-mediatek-filogic-ruijie_rg-x60-new-squashfs-sysupgrade.bin",
      "sha256": "…",
      "size": 33554432,
      "file": "zerowrt-mediatek-filogic-ruijie_rg-x60-new-squashfs-sysupgrade.bin",
      "changelog": "**ZeroWrt 20261020**\n\nDevice: `ruijie_rg-x60-new`…"
    },
    "ruijie,rg-x60-new": { "...": "同上" },
    "x86_64":            { "...": "x86 传统 BIOS 镜像（兜底）" },
    "x86_64+bios":       { "...": "x86 传统 BIOS 镜像" },
    "x86_64+efi":        { "...": "x86 EFI 镜像" },
    "x86/64":            { "...": "同 x86_64" },
    "generic":           { "...": "同 x86_64" }
  }
}
```

> 每次构建只会替换**本次设备**的条目，所以 `ruijie_rg-x60-new` 和 `x86_64`
> 各自构建一次后，索引里两套设备都在。

---

## 三、更新日志（changelog）

索引里的 `changelog` 默认由 `dist/BUILD_INFO.txt` + 本次 Actions 运行链接组成。
如果想要更漂亮的更新日志，加一个步骤把 Markdown 写到文件，然后传参：

```yaml
      - name: Publish OTA index
        if: success()
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          cat > ota-changelog.md <<'EOF'
          ## 本次更新

          - 内核升级到 6.18
          - 修复 xxx

          EOF
          sh "$LEDE_DIR/package/new/luci-app-ota/tools/publish_ota_index.sh" \
            --repo "$GITHUB_REPOSITORY" \
            --dist dist \
            --meta "$GITHUB_WORKSPACE/ota-meta.json" \
            --tag "$ZEROWRT_DEVICE" \
            --branch ota \
            --changelog ota-changelog.md
```

界面里按 Markdown 渲染（标题、列表、粗体、行内代码、代码块、链接、引用），
长文本自动滚动，最多保存 4000 字符。

---

## 四、验证

1. 跑一次 `Build ZeroWrt`（任选设备）。
2. 确认 Actions 日志里出现 `[ota] wrote …/etc/ota/build.json`、
   `[ota] published to https://raw.githubusercontent.com/…/ota/ota.json`。
3. 打开索引地址，确认 JSON 里有该设备的 key。
4. 设备上：

```sh
# 装好插件后
ota info                 # 看 local.build_date / keys / config.api_url
ota check                # 应该输出 ok: true, check.newer: false
uci set ota.config.api_url='https://raw.githubusercontent.com/MinimaxFlora/ZeroWrt/ota/ota.json'
uci commit ota
```

5. 下次构建出新固件后再 `ota check`，`check.newer` 应为 `true`，
   然后到 LuCI「系统 → 在线升级」里下载并安装。

---

## 五、本地调试（不跑 CI）

在 Linux 上准备两个目录即可模拟：

```sh
mkdir -p /tmp/dist
cp zerowrt-…-sysupgrade.bin /tmp/dist/
cd /tmp/dist && sha256sum * > SHA256SUMS && cd -

python3 luci-app-ota/tools/gen_ota_index.py \
  --dist /tmp/dist --out /tmp/ota.json \
  --repo MinimaxFlora/ZeroWrt --tag x86_64 \
  --device x86_64 --target x86/64 \
  --version 20261020 --build-date "$(date +%s)" \
  --changelog-file notes.md

python3 -m json.tool /tmp/ota.json
```

`gen_ota_index.py` 也可以单独用于任何固件仓库：只要给出
`--dist`（含固件与 `SHA256SUMS`）、`--repo`/`--tag`、`--device`，
就能生成索引；`--existing` 用来合并旧索引。

---

## 六、可选：把插件写进 Python 代码而不是工作流

如果你更希望逻辑集中在 `scripts/` 里，把克隆放到 `packages.py`：

```python
    _clone(
        _env("LUCI_APP_OTA_REPO", "https://github.com/MinimaxFlora/luci-app-ota.git"),
        "main",
        new_dir / "luci-app-ota",
    )
```

（`_clone` 的 `ref` 参数必需，`main` 即本仓库默认分支。）

元数据写入放到 `configgen.py` 的 `generate()` 里、`make defconfig` 之后：

```python
    util.run([
        sys.executable,
        str(Path(__file__).resolve().parents[0] / ".." / ".." / "tools" / "embed_ota_meta.py"),
        "--tree", str(tree),
        "--info", str(info_path),
    ], cwd=tree, check=True)
```

两条路效果一样，工作流方案改动更少。
