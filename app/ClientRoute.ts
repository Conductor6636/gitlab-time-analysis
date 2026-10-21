"use client";

import type { MouseEvent } from "react";
import { useEffect, useState } from "react";

const GROUP_ROUTE_PREFIX = "/group/";

export function groupRouteHref(groupId: string) {
  return `${GROUP_ROUTE_PREFIX}${groupId
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

function getGroupIdFromPathname(pathname: string) {
  if (!pathname.startsWith(GROUP_ROUTE_PREFIX)) return null;
  const segments = pathname
    .slice(GROUP_ROUTE_PREFIX.length)
    .split("/")
    .filter(Boolean);
  try {
    return (
      segments.map((segment) => decodeURIComponent(segment)).join("/") || null
    );
  } catch {
    return null;
  }
}

export function useClientGroupRoute() {
  const [groupId, setGroupId] = useState<string | null>(null);

  useEffect(() => {
    const updateGroupId = () => {
      setGroupId(getGroupIdFromPathname(window.location.pathname));
    };
    updateGroupId();
    window.addEventListener("popstate", updateGroupId);
    window.addEventListener("client-group-route-change", updateGroupId);
    return () => {
      window.removeEventListener("popstate", updateGroupId);
      window.removeEventListener("client-group-route-change", updateGroupId);
    };
  }, []);

  return groupId;
}

export function navigateToGroup(groupId: string) {
  window.history.pushState(null, "", groupRouteHref(groupId));
  window.dispatchEvent(new Event("client-group-route-change"));
}

export function handleGroupRouteClick(
  event: MouseEvent<HTMLAnchorElement>,
  groupId: string,
) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }

  event.preventDefault();
  navigateToGroup(groupId);
}

export function navigateHome() {
  window.history.pushState(null, "", "/");
  window.dispatchEvent(new Event("client-group-route-change"));
}
