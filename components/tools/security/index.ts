import type { ComponentType } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { lazyTool } from "../lazy";

/** Processor id → UI component for the "security" category (each a separate chunk). */
const components: Record<string, ComponentType<ToolComponentProps>> = {
  "security.hash": lazyTool(() => import("./hash-tool")),
  "security.checksum": lazyTool(() => import("./checksum-generator")),
  "security.checksum-verify": lazyTool(() => import("./checksum-verifier")),
  "security.aes": lazyTool(() => import("./aes-tool")),
  "security.password": lazyTool(() => import("./password-generator")),
  "security.strength": lazyTool(() => import("./strength-checker")),
  "security.random-string": lazyTool(() => import("./random-string")),
  "security.rsa": lazyTool(() => import("./rsa-generator")),
};

export default components;
