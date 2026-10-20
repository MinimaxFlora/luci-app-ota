# SPDX-License-Identifier: MIT
#
# luci-app-ota - online firmware upgrade (OTA) for OpenWrt / LEDE
#
# Works with both package managers:
#   * opkg based trees (OpenWrt 24.10 and older, LEDE)
#   * apk  based trees (OpenWrt 25.12 and newer)
#
# The package itself is architecture independent (ucode + shell + JS), so the
# same Makefile builds an .ipk or an .apk depending on the tree it is built in.

include $(TOPDIR)/rules.mk

# Pin the package name so the package also builds when the checkout directory
# is not literally named "luci-app-ota" (feed checkouts, git clones, ...).
LUCI_NAME:=luci-app-ota

LUCI_TITLE:=LuCI app for online firmware upgrade (OTA)
LUCI_DESCRIPTION:=Check, download and flash firmware images published through a \
 simple JSON index. Provides a "System -> OTA Firmware Update" page with update \
 check, resumable download and sysupgrade, plus a small CLI (/usr/bin/ota).

# luci-base already provides most of these, but the plugin states its runtime
# requirements explicitly so it also works on trees with a trimmed luci-base.
LUCI_DEPENDS:=+luci-base +rpcd +rpcd-mod-ucode +ucode +ucode-mod-fs +ucode-mod-uci +curl
LUCI_PKGARCH:=all

PKG_VERSION:=1.0.0
PKG_RELEASE:=1
PKG_LICENSE:=MIT
PKG_MAINTAINER:=MinimaxFlora <MinimaxFlora@users.noreply.github.com>

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
