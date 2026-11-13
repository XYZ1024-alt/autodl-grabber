// ==UserScript==
// @name         AutoDL 自动抢机助手
// @namespace    autodl-grabber
// @version      0.2.0
// @description  监测 AutoDL 空闲 GPU，在满足条件时自动创建并开机一台按量计费实例（支持数据盘扩容）。
// @license      MIT
// @match        https://www.autodl.com/create
// @match        https://www.autodl.com/create/*
// @exclude      https://www.autodl.com/create/pro*
// @match        https://www.autodl.com/market/*
// @match        https://www.autodl.com/console/instance/list*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

"use strict";
(() => {
  // node_modules/.pnpm/valibot@1.5.0_typescript@7.0.2/node_modules/valibot/dist/index.mjs
  var store$4;
  var DEFAULT_CONFIG = {
    lang: void 0,
    message: void 0,
    abortEarly: void 0,
    abortPipeEarly: void 0
  };
  // @__NO_SIDE_EFFECTS__
  function getGlobalConfig(config$1) {
    if (!config$1 && !store$4) return DEFAULT_CONFIG;
    return {
      lang: config$1?.lang ?? store$4?.lang,
      message: config$1?.message,
      abortEarly: config$1?.abortEarly ?? store$4?.abortEarly,
      abortPipeEarly: config$1?.abortPipeEarly ?? store$4?.abortPipeEarly
    };
  }
  var store$3;
  // @__NO_SIDE_EFFECTS__
  function getGlobalMessage(lang) {
    return store$3?.get(lang);
  }
  var store$2;
  // @__NO_SIDE_EFFECTS__
  function getSchemaMessage(lang) {
    return store$2?.get(lang);
  }
  var store$1;
  // @__NO_SIDE_EFFECTS__
  function getSpecificMessage(reference, lang) {
    return store$1?.get(reference)?.get(lang);
  }
  // @__NO_SIDE_EFFECTS__
  function _stringify(input) {
    const type = typeof input;
    if (type === "string") return `"${input}"`;
    if (type === "number" || type === "bigint" || type === "boolean") return `${input}`;
    if (type === "object" || type === "function") return (input && Object.getPrototypeOf(input)?.constructor?.name) ?? "null";
    return type;
  }
  function _addIssue(context, label, dataset, config$1, other) {
    const input = other && "input" in other ? other.input : dataset.value;
    const expected = other?.expected ?? context.expects ?? null;
    const received = other?.received ?? /* @__PURE__ */ _stringify(input);
    const issue = {
      kind: context.kind,
      type: context.type,
      input,
      expected,
      received,
      message: `Invalid ${label}: ${expected ? `Expected ${expected} but r` : "R"}eceived ${received}`,
      requirement: context.requirement,
      path: other?.path,
      issues: other?.issues,
      lang: config$1.lang,
      abortEarly: config$1.abortEarly,
      abortPipeEarly: config$1.abortPipeEarly
    };
    const isSchema = context.kind === "schema";
    const message$1 = other?.message ?? context.message ?? /* @__PURE__ */ getSpecificMessage(context.reference, issue.lang) ?? (isSchema ? /* @__PURE__ */ getSchemaMessage(issue.lang) : null) ?? config$1.message ?? /* @__PURE__ */ getGlobalMessage(issue.lang);
    if (message$1 !== void 0) issue.message = typeof message$1 === "function" ? message$1(issue) : message$1;
    if (isSchema) dataset.typed = false;
    if (dataset.issues) dataset.issues.push(issue);
    else dataset.issues = [issue];
  }
  // @__NO_SIDE_EFFECTS__
  function _isValidObjectKey(object$1, key) {
    return Object.prototype.hasOwnProperty.call(object$1, key) && key !== "__proto__" && key !== "prototype" && key !== "constructor";
  }
  // @__NO_SIDE_EFFECTS__
  function _joinExpects(values$1, separator) {
    const list = [...new Set(values$1)];
    if (list.length > 1) return `(${list.join(` ${separator} `)})`;
    return list[0] ?? "never";
  }
  function _standardSchema(schema) {
    schema["~standard"] = {
      version: 1,
      vendor: "valibot",
      validate: (value$1) => schema["~run"]({ value: value$1 }, /* @__PURE__ */ getGlobalConfig())
    };
    return schema;
  }
  // @__NO_SIDE_EFFECTS__
  function finite(message$1) {
    return {
      kind: "validation",
      type: "finite",
      reference: finite,
      async: false,
      expects: null,
      requirement: Number.isFinite,
      message: message$1,
      "~run"(dataset, config$1) {
        if (dataset.typed && !this.requirement(dataset.value)) _addIssue(this, "finite", dataset, config$1);
        return dataset;
      }
    };
  }
  // @__NO_SIDE_EFFECTS__
  function integer(message$1) {
    return {
      kind: "validation",
      type: "integer",
      reference: integer,
      async: false,
      expects: null,
      requirement: Number.isInteger,
      message: message$1,
      "~run"(dataset, config$1) {
        if (dataset.typed && !this.requirement(dataset.value)) _addIssue(this, "integer", dataset, config$1);
        return dataset;
      }
    };
  }
  // @__NO_SIDE_EFFECTS__
  function maxValue(requirement, message$1) {
    return {
      kind: "validation",
      type: "max_value",
      reference: maxValue,
      async: false,
      expects: `<=${requirement instanceof Date ? requirement.toJSON() : /* @__PURE__ */ _stringify(requirement)}`,
      requirement,
      message: message$1,
      "~run"(dataset, config$1) {
        if (dataset.typed && !(dataset.value <= this.requirement)) _addIssue(this, "value", dataset, config$1, { received: dataset.value instanceof Date ? dataset.value.toJSON() : /* @__PURE__ */ _stringify(dataset.value) });
        return dataset;
      }
    };
  }
  // @__NO_SIDE_EFFECTS__
  function minLength(requirement, message$1) {
    return {
      kind: "validation",
      type: "min_length",
      reference: minLength,
      async: false,
      expects: `>=${requirement}`,
      requirement,
      message: message$1,
      "~run"(dataset, config$1) {
        if (dataset.typed && dataset.value.length < this.requirement) _addIssue(this, "length", dataset, config$1, { received: `${dataset.value.length}` });
        return dataset;
      }
    };
  }
  // @__NO_SIDE_EFFECTS__
  function minValue(requirement, message$1) {
    return {
      kind: "validation",
      type: "min_value",
      reference: minValue,
      async: false,
      expects: `>=${requirement instanceof Date ? requirement.toJSON() : /* @__PURE__ */ _stringify(requirement)}`,
      requirement,
      message: message$1,
      "~run"(dataset, config$1) {
        if (dataset.typed && !(dataset.value >= this.requirement)) _addIssue(this, "value", dataset, config$1, { received: dataset.value instanceof Date ? dataset.value.toJSON() : /* @__PURE__ */ _stringify(dataset.value) });
        return dataset;
      }
    };
  }
  // @__NO_SIDE_EFFECTS__
  function getFallback(schema, dataset, config$1) {
    return typeof schema.fallback === "function" ? schema.fallback(dataset, config$1) : schema.fallback;
  }
  // @__NO_SIDE_EFFECTS__
  function fallback(schema, fallback$1) {
    return _standardSchema({
      ...schema,
      fallback: fallback$1,
      "~run"(dataset, config$1) {
        const outputDataset = schema["~run"](dataset, config$1);
        return outputDataset.issues ? {
          typed: true,
          value: /* @__PURE__ */ getFallback(this, outputDataset, config$1)
        } : outputDataset;
      }
    });
  }
  // @__NO_SIDE_EFFECTS__
  function getDefault(schema, dataset, config$1) {
    return typeof schema.default === "function" ? schema.default(dataset, config$1) : schema.default;
  }
  // @__NO_SIDE_EFFECTS__
  function array(item, message$1) {
    return _standardSchema({
      kind: "schema",
      type: "array",
      reference: array,
      expects: "Array",
      async: false,
      item,
      message: message$1,
      "~run"(dataset, config$1) {
        const input = dataset.value;
        if (Array.isArray(input)) {
          dataset.typed = true;
          dataset.value = [];
          for (let key = 0; key < input.length; key++) {
            const value$1 = input[key];
            const itemDataset = this.item["~run"]({ value: value$1 }, config$1);
            if (itemDataset.issues) {
              const pathItem = {
                type: "array",
                origin: "value",
                input,
                key,
                value: value$1
              };
              for (const issue of itemDataset.issues) {
                if (issue.path) issue.path.unshift(pathItem);
                else issue.path = [pathItem];
                dataset.issues?.push(issue);
              }
              if (!dataset.issues) dataset.issues = itemDataset.issues;
              if (config$1.abortEarly) {
                dataset.typed = false;
                break;
              }
            }
            if (!itemDataset.typed) dataset.typed = false;
            dataset.value.push(itemDataset.value);
          }
        } else _addIssue(this, "type", dataset, config$1);
        return dataset;
      }
    });
  }
  // @__NO_SIDE_EFFECTS__
  function boolean(message$1) {
    return _standardSchema({
      kind: "schema",
      type: "boolean",
      reference: boolean,
      expects: "boolean",
      async: false,
      message: message$1,
      "~run"(dataset, config$1) {
        if (typeof dataset.value === "boolean") dataset.typed = true;
        else _addIssue(this, "type", dataset, config$1);
        return dataset;
      }
    });
  }
  // @__NO_SIDE_EFFECTS__
  function lazy(getter) {
    return _standardSchema({
      kind: "schema",
      type: "lazy",
      reference: lazy,
      expects: "unknown",
      async: false,
      getter,
      "~run"(dataset, config$1) {
        return this.getter(dataset.value)["~run"](dataset, config$1);
      }
    });
  }
  // @__NO_SIDE_EFFECTS__
  function nullable(wrapped, default_) {
    return _standardSchema({
      kind: "schema",
      type: "nullable",
      reference: nullable,
      expects: `(${wrapped.expects} | null)`,
      async: false,
      wrapped,
      default: default_,
      "~run"(dataset, config$1) {
        if (dataset.value === null) {
          if (this.default !== void 0) dataset.value = /* @__PURE__ */ getDefault(this, dataset, config$1);
          if (dataset.value === null) {
            dataset.typed = true;
            return dataset;
          }
        }
        return this.wrapped["~run"](dataset, config$1);
      }
    });
  }
  // @__NO_SIDE_EFFECTS__
  function nullish(wrapped, default_) {
    return _standardSchema({
      kind: "schema",
      type: "nullish",
      reference: nullish,
      expects: `(${wrapped.expects} | null | undefined)`,
      async: false,
      wrapped,
      default: default_,
      "~run"(dataset, config$1) {
        if (dataset.value === null || dataset.value === void 0) {
          if (this.default !== void 0) dataset.value = /* @__PURE__ */ getDefault(this, dataset, config$1);
          if (dataset.value === null || dataset.value === void 0) {
            dataset.typed = true;
            return dataset;
          }
        }
        return this.wrapped["~run"](dataset, config$1);
      }
    });
  }
  // @__NO_SIDE_EFFECTS__
  function number(message$1) {
    return _standardSchema({
      kind: "schema",
      type: "number",
      reference: number,
      expects: "number",
      async: false,
      message: message$1,
      "~run"(dataset, config$1) {
        if (typeof dataset.value === "number" && !isNaN(dataset.value)) dataset.typed = true;
        else _addIssue(this, "type", dataset, config$1);
        return dataset;
      }
    });
  }
  // @__NO_SIDE_EFFECTS__
  function object(entries$1, message$1) {
    return _standardSchema({
      kind: "schema",
      type: "object",
      reference: object,
      expects: "Object",
      async: false,
      entries: entries$1,
      message: message$1,
      "~run"(dataset, config$1) {
        const input = dataset.value;
        if (input && typeof input === "object") {
          dataset.typed = true;
          dataset.value = {};
          for (const key in this.entries) {
            const valueSchema = this.entries[key];
            if (key in input || (valueSchema.type === "exact_optional" || valueSchema.type === "optional" || valueSchema.type === "nullish") && valueSchema.default !== void 0) {
              const value$1 = key in input ? input[key] : /* @__PURE__ */ getDefault(valueSchema);
              const valueDataset = valueSchema["~run"]({ value: value$1 }, config$1);
              if (valueDataset.issues) {
                const pathItem = {
                  type: "object",
                  origin: "value",
                  input,
                  key,
                  value: value$1
                };
                for (const issue of valueDataset.issues) {
                  if (issue.path) issue.path.unshift(pathItem);
                  else issue.path = [pathItem];
                  dataset.issues?.push(issue);
                }
                if (!dataset.issues) dataset.issues = valueDataset.issues;
                if (config$1.abortEarly) {
                  dataset.typed = false;
                  break;
                }
              }
              if (!valueDataset.typed) dataset.typed = false;
              dataset.value[key] = valueDataset.value;
            } else if (valueSchema.fallback !== void 0) dataset.value[key] = /* @__PURE__ */ getFallback(valueSchema);
            else if (valueSchema.type !== "exact_optional" && valueSchema.type !== "optional" && valueSchema.type !== "nullish") {
              _addIssue(this, "key", dataset, config$1, {
                input: void 0,
                expected: `"${key}"`,
                path: [{
                  type: "object",
                  origin: "key",
                  input,
                  key,
                  value: input[key]
                }]
              });
              if (config$1.abortEarly) break;
            }
          }
        } else _addIssue(this, "type", dataset, config$1);
        return dataset;
      }
    });
  }
  // @__NO_SIDE_EFFECTS__
  function optional(wrapped, default_) {
    return _standardSchema({
      kind: "schema",
      type: "optional",
      reference: optional,
      expects: `(${wrapped.expects} | undefined)`,
      async: false,
      wrapped,
      default: default_,
      "~run"(dataset, config$1) {
        if (dataset.value === void 0) {
          if (this.default !== void 0) dataset.value = /* @__PURE__ */ getDefault(this, dataset, config$1);
          if (dataset.value === void 0) {
            dataset.typed = true;
            return dataset;
          }
        }
        return this.wrapped["~run"](dataset, config$1);
      }
    });
  }
  // @__NO_SIDE_EFFECTS__
  function picklist(options, message$1) {
    return _standardSchema({
      kind: "schema",
      type: "picklist",
      reference: picklist,
      expects: /* @__PURE__ */ _joinExpects(options.map(_stringify), "|"),
      async: false,
      options,
      message: message$1,
      "~run"(dataset, config$1) {
        if (this.options.includes(dataset.value)) dataset.typed = true;
        else _addIssue(this, "type", dataset, config$1);
        return dataset;
      }
    });
  }
  // @__NO_SIDE_EFFECTS__
  function record(key, value$1, message$1) {
    return _standardSchema({
      kind: "schema",
      type: "record",
      reference: record,
      expects: "Object",
      async: false,
      key,
      value: value$1,
      message: message$1,
      "~run"(dataset, config$1) {
        const input = dataset.value;
        if (input && typeof input === "object") {
          dataset.typed = true;
          dataset.value = {};
          for (const entryKey in input) if (/* @__PURE__ */ _isValidObjectKey(input, entryKey)) {
            const entryValue = input[entryKey];
            const keyDataset = this.key["~run"]({ value: entryKey }, config$1);
            if (keyDataset.issues) {
              const pathItem = {
                type: "object",
                origin: "key",
                input,
                key: entryKey,
                value: entryValue
              };
              for (const issue of keyDataset.issues) {
                issue.path = [pathItem];
                dataset.issues?.push(issue);
              }
              if (!dataset.issues) dataset.issues = keyDataset.issues;
              if (config$1.abortEarly) {
                dataset.typed = false;
                break;
              }
            }
            const valueDataset = this.value["~run"]({ value: entryValue }, config$1);
            if (valueDataset.issues) {
              const pathItem = {
                type: "object",
                origin: "value",
                input,
                key: entryKey,
                value: entryValue
              };
              for (const issue of valueDataset.issues) {
                if (issue.path) issue.path.unshift(pathItem);
                else issue.path = [pathItem];
                dataset.issues?.push(issue);
              }
              if (!dataset.issues) dataset.issues = valueDataset.issues;
              if (config$1.abortEarly) {
                dataset.typed = false;
                break;
              }
            }
            if (!keyDataset.typed || !valueDataset.typed) dataset.typed = false;
            if (keyDataset.typed) dataset.value[keyDataset.value] = valueDataset.value;
          }
        } else _addIssue(this, "type", dataset, config$1);
        return dataset;
      }
    });
  }
  // @__NO_SIDE_EFFECTS__
  function string(message$1) {
    return _standardSchema({
      kind: "schema",
      type: "string",
      reference: string,
      expects: "string",
      async: false,
      message: message$1,
      "~run"(dataset, config$1) {
        if (typeof dataset.value === "string") dataset.typed = true;
        else _addIssue(this, "type", dataset, config$1);
        return dataset;
      }
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _subIssues(datasets) {
    let issues;
    if (datasets) for (const dataset of datasets) if (issues) for (const issue of dataset.issues) issues.push(issue);
    else issues = dataset.issues;
    return issues;
  }
  // @__NO_SIDE_EFFECTS__
  function union(options, message$1) {
    return _standardSchema({
      kind: "schema",
      type: "union",
      reference: union,
      expects: /* @__PURE__ */ _joinExpects(options.map((option) => option.expects), "|"),
      async: false,
      options,
      message: message$1,
      "~run"(dataset, config$1) {
        let validDataset;
        let typedDatasets;
        let untypedDatasets;
        for (const schema of this.options) {
          const optionDataset = schema["~run"]({ value: dataset.value }, config$1);
          if (optionDataset.typed) if (optionDataset.issues) if (typedDatasets) typedDatasets.push(optionDataset);
          else typedDatasets = [optionDataset];
          else {
            validDataset = optionDataset;
            break;
          }
          else if (untypedDatasets) untypedDatasets.push(optionDataset);
          else untypedDatasets = [optionDataset];
        }
        if (validDataset) return validDataset;
        if (typedDatasets) {
          if (typedDatasets.length === 1) return typedDatasets[0];
          _addIssue(this, "type", dataset, config$1, { issues: /* @__PURE__ */ _subIssues(typedDatasets) });
          dataset.typed = true;
        } else if (untypedDatasets?.length === 1) return untypedDatasets[0];
        else _addIssue(this, "type", dataset, config$1, { issues: /* @__PURE__ */ _subIssues(untypedDatasets) });
        return dataset;
      }
    });
  }
  // @__NO_SIDE_EFFECTS__
  function pipe(...pipe$1) {
    return _standardSchema({
      ...pipe$1[0],
      pipe: pipe$1,
      "~run"(dataset, config$1) {
        for (const item of pipe$1) if (item.kind !== "metadata") {
          if (dataset.issues && (item.kind === "schema" || item.kind === "transformation")) {
            dataset.typed = false;
            break;
          }
          if (!dataset.issues || !config$1.abortEarly && !config$1.abortPipeEarly) dataset = item["~run"](dataset, config$1);
        }
        return dataset;
      }
    });
  }
  // @__NO_SIDE_EFFECTS__
  function safeParse(schema, input, config$1) {
    const dataset = schema["~run"]({ value: input }, /* @__PURE__ */ getGlobalConfig(config$1));
    return {
      typed: dataset.typed,
      success: !dataset.issues,
      output: dataset.value,
      issues: dataset.issues
    };
  }

  // src/domain/result.ts
  var ok = (value) => ({ ok: true, value });
  var fail = (kind, message, code = "") => ({
    ok: false,
    failure: { kind, code, message }
  });

  // src/autodl/http.ts
  var STORAGE_KEYS = { token: "token", user: "user", appVersion: "app_version" };
  var DEFAULT_TIMEOUT_MS = 15e3;
  var Envelope = object({ code: string(), msg: nullish(string(), "") });
  var KIND_BY_CODE = {
    AuthorizeFailed: "auth",
    TORecharge: "balance",
    TORealName: "real-name",
    OrderUnpaidMoreThanThree: "unpaid-orders",
    MachineGpuNumUpdateFailed: "sold-out"
  };
  var KIND_BY_KEYWORD = [
    ["captcha", "captcha"],
    ["\u9A8C\u8BC1\u7801", "captcha"],
    ["\u4EBA\u673A\u9A8C\u8BC1", "captcha"],
    ["\u9891\u7E41", "rate-limit"],
    ["\u6743\u9650", "permission"]
  ];
  var kindOfRefusal = (code, message) => {
    const known = KIND_BY_CODE[code];
    if (known !== void 0) return known;
    const text = `${code} ${message}`.toLowerCase();
    return KIND_BY_KEYWORD.find(([keyword]) => text.includes(keyword))?.[1] ?? "rejected";
  };
  var KIND_BY_STATUS = { 401: "auth", 403: "permission", 429: "rate-limit" };
  var parseJson = (text) => {
    try {
      return { ok: true, value: JSON.parse(text) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  };
  var StoredUser = object({ sub_name: nullish(string(), "") });
  var isSubAccount = (storage) => {
    const parsed = parseJson(storage.getItem(STORAGE_KEYS.user) ?? "null");
    if (!parsed.ok) return false;
    const user = safeParse(StoredUser, parsed.value);
    return user.success && user.output.sub_name !== "";
  };
  var StoredVersion = object({ version: string() });
  var appVersion = (storage) => {
    const parsed = parseJson(storage.getItem(STORAGE_KEYS.appVersion) ?? "null");
    const stored = parsed.ok ? safeParse(StoredVersion, parsed.value) : null;
    return stored?.success ? stored.output.version : "0.0.0";
  };
  var buildUrl = (path, query, subAccount) => {
    const scoped = subAccount ? path.replace("api/v1", "api/v1/sub_user") : path;
    const search = query === void 0 ? "" : `?${new URLSearchParams(query)}`;
    return `/${scoped}${search}`;
  };
  var createHttp = ({ fetch, storage }) => async (spec) => {
    const uncertain = spec.uncertain ?? "transient";
    const token = storage.getItem(STORAGE_KEYS.token) ?? "";
    if (token === "") return fail("auth", "\u672A\u68C0\u6D4B\u5230\u767B\u5F55\u72B6\u6001");
    const controller = new AbortController();
    const timeoutMs = spec.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const exchange = async () => {
      try {
        const response = await fetch(buildUrl(spec.path, spec.query, isSubAccount(storage)), {
          method: spec.method,
          headers: {
            "Content-Type": "application/json",
            Authorization: token,
            AppVersion: appVersion(storage)
          },
          body: spec.body === void 0 ? void 0 : JSON.stringify(spec.body),
          credentials: "same-origin",
          signal: controller.signal
        });
        return ok({ status: response.status, text: await response.text() });
      } catch (error) {
        const cause = controller.signal.aborted ? `\u8D85\u8FC7 ${timeoutMs / 1e3} \u79D2\u672A\u54CD\u5E94` : error instanceof Error ? error.message : String(error);
        return fail(uncertain, `\u8BF7\u6C42\u672A\u5B8C\u6210\uFF08${cause}\uFF09\uFF1A${spec.path}`);
      } finally {
        clearTimeout(timer);
      }
    };
    const exchanged = await exchange();
    if (!exchanged.ok) return exchanged;
    const { status, text } = exchanged.value;
    const statusKind = KIND_BY_STATUS[status];
    if (statusKind !== void 0) return fail(statusKind, `HTTP ${status}\uFF1A${spec.path}`, String(status));
    if (status >= 500) return fail(uncertain, `\u670D\u52A1\u5668\u9519\u8BEF HTTP ${status}\uFF1A${spec.path}`, String(status));
    const unreadable = uncertain === "ambiguous" ? "ambiguous" : "invalid-response";
    const json = parseJson(text);
    if (!json.ok) return fail(unreadable, `\u54CD\u5E94\u4E0D\u662F JSON\uFF08HTTP ${status}\uFF0C${json.error}\uFF09\uFF1A${spec.path}`);
    const envelope = safeParse(Envelope, json.value);
    if (!envelope.success) return fail(unreadable, `\u54CD\u5E94\u7F3A\u5C11 code \u5B57\u6BB5\uFF08HTTP ${status}\uFF09\uFF1A${spec.path}`);
    const { code, msg } = envelope.output;
    if (code !== "Success") return fail(kindOfRefusal(code, msg), msg === "" ? code : msg, code);
    const payload = safeParse(object({ data: spec.data }), json.value);
    if (!payload.success) {
      const issue = payload.issues[0];
      const where = issue.path?.map((item) => String(item.key)).join(".") ?? "data";
      return fail(unreadable, `\u54CD\u5E94\u5B57\u6BB5 ${where} \u4E0E\u9884\u671F\u4E0D\u7B26\uFF08${issue.message}\uFF09\uFF1A${spec.path}`);
    }
    return ok(payload.output.data);
  };

  // src/domain/units.ts
  var GIB = 1024 ** 3;
  var gbToBytes = (gb) => gb * GIB;
  var bytesToGb = (bytes) => bytes / GIB;
  var yuanToMilli = (yuan) => Math.round(yuan * 1e3);
  var formatYuan = (milli, digits = 2) => `\uFFE5${(milli / 1e3).toFixed(digits)}`;
  var formatGb = (bytes) => `${Math.round(bytesToGb(bytes) * 100) / 100} GB`;

  // src/domain/config.ts
  var MIN_INTERVAL_SEC = 10;
  var MAX_INTERVAL_SEC = 3600;
  var DraftSchema = object({
    gpuNames: fallback(array(string()), []),
    gpuCount: fallback(number(), 1),
    /** Region ids in priority order. */
    regionIds: fallback(array(string()), []),
    /** Price cap of the whole instance per hour, in CNY. 0 means "not set yet". */
    maxHourlyYuan: fallback(number(), 0),
    imageKind: fallback(picklist(["official", "private"]), "official"),
    imageUuid: fallback(string(), ""),
    /** Extra paid data disk in GB on top of the free data disk. 0 means no expansion. */
    expandGb: fallback(number(), 0),
    intervalSec: fallback(number(), 30)
  });
  var defaultDraft = () => ({
    gpuNames: [],
    gpuCount: 1,
    regionIds: [],
    maxHourlyYuan: 0,
    imageKind: "official",
    imageUuid: "",
    expandGb: 0,
    intervalSec: 30
  });
  var ConfigSchema = object({
    gpuNames: pipe(array(string()), minLength(1, "\u8BF7\u81F3\u5C11\u9009\u62E9\u4E00\u4E2A GPU \u578B\u53F7")),
    gpuCount: pipe(
      number("GPU \u6570\u91CF\u5FC5\u987B\u662F\u6570\u5B57"),
      integer("GPU \u6570\u91CF\u5FC5\u987B\u662F\u6574\u6570"),
      minValue(1, "GPU \u6570\u91CF\u81F3\u5C11\u4E3A 1"),
      maxValue(12, "GPU \u6570\u91CF\u6700\u591A\u4E3A 12")
    ),
    regionIds: pipe(array(string()), minLength(1, "\u8BF7\u81F3\u5C11\u9009\u62E9\u4E00\u4E2A\u5730\u533A")),
    maxHourlyYuan: pipe(
      number("\u6BCF\u5C0F\u65F6\u4EF7\u683C\u4E0A\u9650\u5FC5\u987B\u662F\u6570\u5B57"),
      finite("\u6BCF\u5C0F\u65F6\u4EF7\u683C\u4E0A\u9650\u5FC5\u987B\u662F\u6570\u5B57"),
      minValue(0.01, "\u8BF7\u586B\u5199\u5927\u4E8E 0 \u7684\u6BCF\u5C0F\u65F6\u4EF7\u683C\u4E0A\u9650")
    ),
    imageKind: picklist(["official", "private"]),
    imageUuid: pipe(string(), minLength(1, "\u8BF7\u9009\u62E9\u955C\u50CF")),
    expandGb: pipe(
      number("\u6269\u5BB9\u5927\u5C0F\u5FC5\u987B\u662F\u6570\u5B57"),
      integer("\u6269\u5BB9\u5927\u5C0F\u5FC5\u987B\u662F\u6574\u6570 GB\uFF08\u6B65\u957F 1 GB\uFF09"),
      minValue(0, "\u6269\u5BB9\u5927\u5C0F\u4E0D\u80FD\u5C0F\u4E8E 0 GB")
    ),
    intervalSec: pipe(
      number("\u76D1\u6D4B\u95F4\u9694\u5FC5\u987B\u662F\u6570\u5B57"),
      integer("\u76D1\u6D4B\u95F4\u9694\u5FC5\u987B\u662F\u6574\u6570\u79D2"),
      minValue(MIN_INTERVAL_SEC, `\u76D1\u6D4B\u95F4\u9694\u4E0D\u80FD\u5C0F\u4E8E ${MIN_INTERVAL_SEC} \u79D2`),
      maxValue(MAX_INTERVAL_SEC, `\u76D1\u6D4B\u95F4\u9694\u4E0D\u80FD\u5927\u4E8E ${MAX_INTERVAL_SEC} \u79D2`)
    )
  });
  var buildPlan = (draft, catalog) => {
    const parsed = safeParse(ConfigSchema, draft);
    if (!parsed.success) return { ok: false, errors: [...new Set(parsed.issues.map((issue) => issue.message))] };
    const config = parsed.output;
    const errors = [];
    const knownGpus = new Set(catalog.gpuTypes.map((gpu) => gpu.name));
    const missingGpus = config.gpuNames.filter((name) => !knownGpus.has(name));
    if (missingGpus.length > 0) errors.push(`GPU \u578B\u53F7\u5DF2\u4E0D\u5B58\u5728\uFF1A${missingGpus.join("\u3001")}\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9`);
    const regions = config.regionIds.flatMap((id) => catalog.regions.filter((region) => region.id === id));
    if (regions.length !== config.regionIds.length) errors.push("\u90E8\u5206\u6240\u9009\u5730\u533A\u5DF2\u4E0D\u5B58\u5728\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u5730\u533A");
    const images = config.imageKind === "official" ? catalog.officialImages : catalog.privateImages;
    const image = images.find((candidate) => candidate.uuid === config.imageUuid);
    if (image === void 0) errors.push("\u6240\u9009\u955C\u50CF\u5DF2\u4E0D\u5B58\u5728\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u955C\u50CF");
    if (image === void 0 || errors.length > 0) return { ok: false, errors };
    const maxHourlyMilli = yuanToMilli(config.maxHourlyYuan);
    return {
      ok: true,
      plan: {
        gpuNames: config.gpuNames,
        gpuCount: config.gpuCount,
        regions,
        maxHourlyMilli,
        image,
        expandGb: config.expandGb,
        intervalMs: config.intervalSec * 1e3,
        criteria: {
          gpuNames: config.gpuNames,
          gpuCount: config.gpuCount,
          regionSigns: regions.flatMap((region) => region.signs),
          maxHourlyMilli,
          expandBytes: gbToBytes(config.expandGb),
          image,
          memberLevel: catalog.memberLevel,
          gpuSeries: Object.fromEntries(catalog.gpuTypes.map((gpu) => [gpu.name, gpu.series]))
        }
      }
    };
  };

  // src/domain/select.ts
  var MIN_CUDA_BY_SERIES = {
    "NVIDIA-Ampere": 11,
    "NVIDIA-Ada": 11.3,
    "NVIDIA-Blackwell": 12.8
  };
  var unitHourlyMilli = (machine, memberLevel) => machine.hourlyMilliByLevel[memberLevel] ?? machine.hourlyMilli;
  var rentModeAllows = (rentMode, count, idle) => {
    const digits = [...rentMode].filter((char) => char >= "0" && char <= "9").join("");
    if (digits === "") return true;
    const size = Number(digits);
    if (idle < size) return true;
    return rentMode.startsWith("Base") ? count >= size : count % size === 0;
  };
  var imageMismatch = (machine, criteria) => {
    const { image } = criteria;
    if (machine.chipCorp !== "nvidia") return `\u82AF\u7247 ${machine.chipCorp} \u7684\u955C\u50CF\u517C\u5BB9\u89C4\u5219\u672A\u5B9E\u73B0\uFF0C\u5DF2\u8DF3\u8FC7`;
    const differs = (imageValue, hostValue) => imageValue !== "" && imageValue !== hostValue;
    if (differs(image.chipCorp, machine.chipCorp) || differs(image.cpuArch, machine.cpuArch))
      return "\u955C\u50CF\u4E0E\u4E3B\u673A\u7684\u82AF\u7247/CPU \u67B6\u6784\u4E0D\u4E00\u81F4";
    if (image.cuda === "") return null;
    const cuda = Number(image.cuda);
    if (machine.highestCuda !== "" && Number(machine.highestCuda) < cuda)
      return `\u955C\u50CF CUDA ${image.cuda} \u9AD8\u4E8E\u4E3B\u673A\u652F\u6301\u7684\u6700\u9AD8\u7248\u672C ${machine.highestCuda}`;
    const minimum = MIN_CUDA_BY_SERIES[criteria.gpuSeries[machine.gpuName] ?? ""];
    if (minimum !== void 0 && cuda < minimum) return `\u8BE5 GPU \u67B6\u6784\u8981\u6C42\u955C\u50CF CUDA \u4E0D\u4F4E\u4E8E ${minimum}`;
    return null;
  };
  var rejectionReason = (machine, criteria) => {
    if (!criteria.gpuNames.includes(machine.gpuName)) return "GPU \u578B\u53F7\u4E0D\u5728\u6240\u9009\u8303\u56F4";
    if (!criteria.regionSigns.includes(machine.regionSign)) return "\u5730\u533A\u4E0D\u5728\u6240\u9009\u8303\u56F4";
    if (machine.gpuIdle < criteria.gpuCount) return `\u7A7A\u95F2 GPU \u4E0D\u8DB3\uFF08${machine.gpuIdle}/${criteria.gpuCount}\uFF09`;
    if (!rentModeAllows(machine.rentMode, criteria.gpuCount, machine.gpuIdle))
      return `\u4E3B\u673A\u79DF\u7528\u89C4\u5219 ${machine.rentMode} \u4E0D\u5141\u8BB8 ${criteria.gpuCount} \u5361`;
    if (machine.maxExpandBytes < criteria.expandBytes)
      return `\u53EF\u6269\u5BB9\u4E0A\u9650 ${Math.floor(bytesToGb(machine.maxExpandBytes))} GB \u5C0F\u4E8E\u6240\u9700 ${bytesToGb(criteria.expandBytes)} GB`;
    const hourly = unitHourlyMilli(machine, criteria.memberLevel) * criteria.gpuCount;
    if (hourly > criteria.maxHourlyMilli)
      return `\u4EF7\u683C ${formatYuan(hourly)}/\u65F6 \u8D85\u8FC7\u4E0A\u9650 ${formatYuan(criteria.maxHourlyMilli)}/\u65F6`;
    return imageMismatch(machine, criteria);
  };
  var selectMachines = (machines, criteria) => {
    const eligible = [];
    const rejected = [];
    for (const machine of machines) {
      const reason = rejectionReason(machine, criteria);
      if (reason === null) eligible.push(machine);
      else rejected.push({ machine, reason });
    }
    const rank = (machine) => criteria.regionSigns.indexOf(machine.regionSign);
    const price = (machine) => unitHourlyMilli(machine, criteria.memberLevel);
    eligible.sort((a, b) => rank(a) - rank(b) || price(a) - price(b) || b.gpuIdle - a.gpuIdle);
    return { eligible, rejected };
  };

  // src/runner/runner.ts
  var ACTIVE_PHASES = ["starting", "monitoring", "paused", "creating", "verifying"];
  var CREATE_SENT_PHASES = ["creating", "verifying"];
  var MAX_ATTEMPTS_PER_POLL = 3;
  var MAX_HOST_PAGES = 10;
  var FRUITLESS_RECHECK_MS = 6e4;
  var MAX_CONSECUTIVE_FAILURES = 6;
  var MAX_BACKOFF_MS = 5 * 6e4;
  var MAX_AMBIGUOUS_CREATES = 2;
  var APPEAR_POLL_MS = 2e3;
  var APPEAR_TRIES = 30;
  var BOOT_POLL_MS = 5e3;
  var BOOT_TRIES = 18;
  var RECONCILE_DELAYS_MS = [3e3, 5e3, 1e4, 15e3, 3e4, 3e4, 3e4];
  var RECONCILE_EXTRA_TRIES = 3;
  var PENDING_WINDOW_MS = 15e4;
  var FAILED_STATUSES = [
    "create_failed",
    "shutdown_by_starting_error",
    "shutdown_by_running_error",
    "re_init_failed"
  ];
  var FAILURE_HINTS = {
    auth: "\u767B\u5F55\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55 AutoDL \u540E\u70B9\u51FB\u201C\u7EE7\u7EED\u201D",
    permission: "\u8D26\u53F7\u6743\u9650\u4E0D\u8DB3",
    captcha: "\u5E73\u53F0\u8981\u6C42\u9A8C\u8BC1\u7801\u6216\u4EBA\u673A\u9A8C\u8BC1\uFF0C\u8BF7\u5728\u9875\u9762\u4E0A\u624B\u52A8\u5B8C\u6210\u540E\u70B9\u51FB\u201C\u7EE7\u7EED\u201D\uFF08\u811A\u672C\u4E0D\u4F1A\u7ED5\u8FC7\u9A8C\u8BC1\uFF09",
    balance: "\u4F59\u989D\u4E0D\u8DB3\uFF0C\u8BF7\u5145\u503C\u540E\u70B9\u51FB\u201C\u7EE7\u7EED\u201D",
    "real-name": "\u9700\u8981\u5148\u5B8C\u6210\u5B9E\u540D\u8BA4\u8BC1",
    "unpaid-orders": "\u5B58\u5728\u591A\u4E2A\u672A\u652F\u4ED8\u8BA2\u5355\uFF0C\u8BF7\u5148\u5904\u7406",
    "sold-out": "\u4E3B\u673A\u7684\u7A7A\u95F2 GPU \u5DF2\u88AB\u79DF\u5B8C",
    "rate-limit": "\u8BF7\u6C42\u8FC7\u4E8E\u9891\u7E41",
    transient: "\u7F51\u7EDC\u6216\u670D\u52A1\u5668\u6682\u65F6\u5F02\u5E38",
    ambiguous: "\u8BF7\u6C42\u7ED3\u679C\u4E0D\u660E\u786E",
    "invalid-response": "\u63A5\u53E3\u8FD4\u56DE\u4E0E\u811A\u672C\u9884\u671F\u4E0D\u7B26\uFF0C\u5E73\u53F0\u53EF\u80FD\u5DF2\u66F4\u65B0\uFF0C\u8BF7\u53C2\u7167 README \u68C0\u67E5\u63A5\u53E3",
    rejected: "\u5E73\u53F0\u62D2\u7EDD\u4E86\u8BF7\u6C42"
  };
  var describeFailure = (failure) => failure.message === "" ? FAILURE_HINTS[failure.kind] : `${FAILURE_HINTS[failure.kind]}\uFF08${failure.message}\uFF09`;
  var describePlan = (plan) => [
    `GPU ${plan.gpuNames.join(" / ")} \xD7 ${plan.gpuCount} \u5361`,
    `\u5730\u533A\u4F18\u5148\u7EA7 ${plan.regions.map((region) => region.name).join(" > ")}`,
    `\u955C\u50CF ${plan.image.label}`,
    `\u4EF7\u683C\u4E0A\u9650 ${formatYuan(plan.maxHourlyMilli)}/\u65F6`,
    plan.expandGb === 0 ? "\u6570\u636E\u76D8\u4E0D\u6269\u5BB9" : `\u6570\u636E\u76D8\u989D\u5916\u6269\u5BB9 ${plan.expandGb} GB`,
    `\u6BCF ${plan.intervalMs / 1e3} \u79D2\u68C0\u67E5\u4E00\u6B21`
  ].join("\uFF1B");
  var hostLabel = (machine) => `${machine.regionName} ${machine.alias}\uFF08${machine.id}\uFF0C${machine.gpuName}\uFF09`;
  var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  var withJitter = (ms) => ms * (0.9 + Math.random() * 0.2);
  var createGate = () => {
    let wake = () => {
    };
    return {
      /** Resolves after ms, or earlier when woken. Without ms it resolves only when woken. */
      wait: (ms) => new Promise((resolve) => {
        const timer = ms === void 0 ? void 0 : setTimeout(resolve, ms);
        wake = () => {
          clearTimeout(timer);
          resolve();
        };
      }),
      wake: () => wake()
    };
  };
  var createRunner = ({ api, pending, lock, log, notify: notify2 }) => {
    let state = { phase: "idle", detail: "", polls: 0, outcome: null };
    let current = null;
    const listeners = /* @__PURE__ */ new Set();
    const set = (patch) => {
      state = { ...state, ...patch };
      for (const listener of listeners) listener(state);
    };
    const finish = (task, phase, outcome) => {
      task.release();
      current = null;
      const { headline } = outcome;
      set({ phase, detail: headline, outcome });
      log.add(phase === "failed" ? "error" : "info", headline);
      if (phase !== "stopped") notify2(phase === "done" ? "AutoDL \u62A2\u673A\u5B8C\u6210" : "AutoDL \u62A2\u673A\u4EFB\u52A1\u5DF2\u505C\u6B62", headline);
      return "finished";
    };
    const pauseTask = (task, reason) => {
      task.pauseReason = reason;
      log.add("warn", `\u5DF2\u6682\u505C\uFF1A${reason}`);
      notify2("AutoDL \u62A2\u673A\u5DF2\u6682\u505C", reason);
    };
    const onReadFailure = async (task, failure) => {
      const text = describeFailure(failure);
      if (failure.kind !== "transient" && failure.kind !== "rate-limit") {
        pauseTask(task, text);
        return;
      }
      task.failures += 1;
      if (task.failures > MAX_CONSECUTIVE_FAILURES) {
        pauseTask(task, `\u8FDE\u7EED ${task.failures} \u6B21\u8BF7\u6C42\u5931\u8D25\uFF1A${text}`);
        return;
      }
      const delay = Math.min(task.plan.intervalMs * 2 ** task.failures, MAX_BACKOFF_MS);
      log.add(
        "warn",
        `${text}\uFF0C${Math.round(delay / 1e3)} \u79D2\u540E\u91CD\u8BD5\uFF08\u7B2C ${task.failures}/${MAX_CONSECUTIVE_FAILURES} \u6B21\uFF09`
      );
      await task.gate.wait(delay);
    };
    const strangerOutcome = (instances) => ({
      headline: `\u53D1\u73B0\u4EFB\u52A1\u542F\u52A8\u540E\u65B0\u51FA\u73B0\u7684\u5B9E\u4F8B ${instances.map((instance) => instance.uuid).join("\u3001")}\uFF0C\u4E3A\u907F\u514D\u91CD\u590D\u521B\u5EFA\u5DF2\u505C\u6B62\u3002\u8BF7\u5230\u63A7\u5236\u53F0\u6838\u5BF9\uFF0C\u8BE5\u5B9E\u4F8B\u53EF\u80FD\u6B63\u5728\u8BA1\u8D39\u3002`,
      instance: instances[0] ?? null,
      machine: null,
      quote: null,
      mayBeBilling: true
    });
    const findInstance = async (match, tries, intervalMs) => {
      for (let attempt2 = 0; attempt2 < tries; attempt2 += 1) {
        const listed = await api.listInstances();
        const found = listed.ok ? listed.value.find(match) : void 0;
        if (found !== void 0) return found;
        await sleep(intervalMs);
      }
      return null;
    };
    const waitForBoot = async (created) => {
      let latest = created;
      const settled = () => latest.status === "running" || FAILED_STATUSES.includes(latest.status);
      for (let attempt2 = 0; attempt2 < BOOT_TRIES && !settled(); attempt2 += 1) {
        await sleep(BOOT_POLL_MS);
        const listed = await api.listInstances();
        latest = (listed.ok ? listed.value.find((instance) => instance.uuid === created.uuid) : void 0) ?? latest;
      }
      return latest;
    };
    const conclude = async (task, machine, quote, created) => {
      pending.clear();
      set({ phase: "verifying", detail: `\u5B9E\u4F8B ${created.uuid} \u5DF2\u521B\u5EFA\uFF0C\u6B63\u5728\u786E\u8BA4\u78C1\u76D8\u4E0E\u5F00\u673A\u72B6\u6001` });
      log.add("info", `\u5B9E\u4F8B ${created.uuid} \u5DF2\u51FA\u73B0\u5728\u5B9E\u4F8B\u5217\u8868`);
      const expected = task.plan.criteria.expandBytes;
      if (created.expandBytes !== expected)
        return finish(task, "failed", {
          headline: `\u5B9E\u4F8B ${created.uuid} \u5DF2\u521B\u5EFA\uFF0C\u4F46\u6570\u636E\u76D8\u6269\u5BB9\u4E0E\u8BBE\u7F6E\u4E0D\u7B26\uFF08\u8BBE\u7F6E ${bytesToGb(expected)} GB\uFF0C\u5B9E\u9645 ${bytesToGb(created.expandBytes)} GB\uFF09\u3002\u4EFB\u52A1\u5DF2\u505C\u6B62\uFF0C\u4E0D\u4F1A\u521B\u5EFA\u5176\u4ED6\u5B9E\u4F8B\u3002\u8BE5\u5B9E\u4F8B\u53EF\u80FD\u6B63\u5728\u8BA1\u8D39\uFF0C\u8BF7\u5230\u63A7\u5236\u53F0\u5904\u7406\u3002`,
          instance: created,
          machine,
          quote,
          mayBeBilling: true
        });
      const booted = await waitForBoot(created);
      if (booted.status === "running")
        return finish(task, "done", {
          headline: `\u62A2\u673A\u6210\u529F\uFF1A\u5B9E\u4F8B ${booted.uuid} \u5DF2\u521B\u5EFA\u5E76\u5F00\u673A\uFF0C\u6B63\u5728\u8BA1\u8D39\u3002`,
          instance: booted,
          machine,
          quote,
          mayBeBilling: true
        });
      if (FAILED_STATUSES.includes(booted.status))
        return finish(task, "failed", {
          headline: `\u5B9E\u4F8B ${booted.uuid} \u5DF2\u521B\u5EFA\uFF0C\u4F46\u5F00\u673A\u5931\u8D25\uFF08\u72B6\u6001 ${booted.status}\uFF09\u3002\u4EFB\u52A1\u5DF2\u505C\u6B62\u3002\u5B9E\u4F8B\u53CA\u4ED8\u8D39\u6570\u636E\u76D8\u53EF\u80FD\u4ECD\u5728\u8BA1\u8D39\uFF0C\u8BF7\u5230\u63A7\u5236\u53F0\u5904\u7406\u3002`,
          instance: booted,
          machine,
          quote,
          mayBeBilling: true
        });
      return finish(task, "done", {
        headline: `\u5B9E\u4F8B ${booted.uuid} \u5DF2\u521B\u5EFA\uFF0C\u5F53\u524D\u72B6\u6001 ${booted.status}\uFF0C\u5C1A\u672A\u786E\u8BA4\u8FDB\u5165\u8FD0\u884C\u4E2D\uFF0C\u8BF7\u5230\u63A7\u5236\u53F0\u67E5\u770B\u3002\u5B9E\u4F8B\u53EF\u80FD\u6B63\u5728\u8BA1\u8D39\u3002`,
        instance: booted,
        machine,
        quote,
        mayBeBilling: true
      });
    };
    const verify = async (task, machine, quote, uuid) => {
      set({ phase: "verifying", detail: `\u5E73\u53F0\u5DF2\u53D7\u7406\uFF0C\u7B49\u5F85\u5B9E\u4F8B ${uuid} \u51FA\u73B0` });
      log.add("info", `\u5E73\u53F0\u8FD4\u56DE\u521B\u5EFA\u6210\u529F\uFF0C\u5B9E\u4F8B ID ${uuid}`);
      const created = await findInstance((instance) => instance.uuid === uuid, APPEAR_TRIES, APPEAR_POLL_MS);
      if (created !== null) return conclude(task, machine, quote, created);
      return finish(task, "failed", {
        headline: `\u5E73\u53F0\u8FD4\u56DE\u521B\u5EFA\u6210\u529F\uFF08\u5B9E\u4F8B ID ${uuid}\uFF09\uFF0C\u4F46 ${APPEAR_TRIES * APPEAR_POLL_MS / 1e3} \u79D2\u5185\u5B9E\u4F8B\u5217\u8868\u4E2D\u6CA1\u6709\u51FA\u73B0\u8BE5\u5B9E\u4F8B\u3002\u4EFB\u52A1\u5DF2\u505C\u6B62\uFF0C\u4E0D\u4F1A\u91CD\u590D\u521B\u5EFA\u3002\u8BF7\u5230\u63A7\u5236\u53F0\u6838\u5BF9\uFF0C\u53EF\u80FD\u6B63\u5728\u8BA1\u8D39\u3002`,
        instance: null,
        machine,
        quote,
        mayBeBilling: true
      });
    };
    const reconcile = async (task, machine, quote) => {
      set({ phase: "verifying", detail: "\u521B\u5EFA\u8BF7\u6C42\u7ED3\u679C\u4E0D\u660E\u786E\uFF0C\u6B63\u5728\u6838\u5BF9\u5B9E\u4F8B\u5217\u8868" });
      log.add("warn", "\u521B\u5EFA\u8BF7\u6C42\u8D85\u65F6\u6216\u8FD4\u56DE\u4E0D\u660E\u786E\u3002\u4E0D\u4F1A\u91CD\u590D\u63D0\u4EA4\uFF0C\u5148\u6838\u5BF9\u5B9E\u4F8B\u5217\u8868\uFF08\u7EA6 2 \u5206\u949F\uFF09");
      let lastReadOk = false;
      for (let round = 0; round < RECONCILE_DELAYS_MS.length + RECONCILE_EXTRA_TRIES; round += 1) {
        await sleep(RECONCILE_DELAYS_MS[round] ?? 3e4);
        const listed = await api.listInstances();
        lastReadOk = listed.ok;
        if (!listed.ok) {
          log.add("warn", `\u6838\u5BF9\u65F6\u8BFB\u53D6\u5B9E\u4F8B\u5217\u8868\u5931\u8D25\uFF1A${describeFailure(listed.failure)}`);
          continue;
        }
        const fresh = listed.value.filter((instance) => !task.knownInstanceIds.has(instance.uuid));
        const mine = fresh.find((instance) => instance.machineId === machine.id);
        if (mine !== void 0) return conclude(task, machine, quote, mine);
        if (fresh.length > 0) return finish(task, "failed", strangerOutcome(fresh));
        if (round >= RECONCILE_DELAYS_MS.length - 1) break;
      }
      if (!lastReadOk)
        return finish(task, "failed", {
          headline: "\u521B\u5EFA\u8BF7\u6C42\u7ED3\u679C\u4E0D\u660E\u786E\uFF0C\u4E14\u65E0\u6CD5\u8BFB\u53D6\u5B9E\u4F8B\u5217\u8868\u5B8C\u6210\u6838\u5BF9\u3002\u4EFB\u52A1\u5DF2\u505C\u6B62\uFF0C\u4E0D\u4F1A\u91CD\u590D\u521B\u5EFA\u3002\u8BF7\u5230\u63A7\u5236\u53F0\u6838\u5BF9\u662F\u5426\u5DF2\u521B\u5EFA\u5B9E\u4F8B\uFF0C\u53EF\u80FD\u6B63\u5728\u8BA1\u8D39\u3002",
          instance: null,
          machine,
          quote,
          mayBeBilling: true
        });
      pending.clear();
      task.ambiguousCreates += 1;
      if (task.ambiguousCreates >= MAX_AMBIGUOUS_CREATES)
        return finish(task, "failed", {
          headline: `\u521B\u5EFA\u8BF7\u6C42\u5DF2 ${task.ambiguousCreates} \u6B21\u7ED3\u679C\u4E0D\u660E\u786E\uFF0C\u6838\u5BF9\u540E\u5747\u672A\u53D1\u73B0\u65B0\u5B9E\u4F8B\u3002\u4E3A\u5B89\u5168\u8D77\u89C1\u4EFB\u52A1\u5DF2\u505C\u6B62\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u65B0\u542F\u52A8\u3002`,
          instance: null,
          machine,
          quote,
          mayBeBilling: false
        });
      log.add("info", "\u6838\u5BF9\u5B8C\u6210\uFF1A\u5B9E\u4F8B\u5217\u8868\u4E2D\u6CA1\u6709\u51FA\u73B0\u65B0\u5B9E\u4F8B\uFF0C\u786E\u8BA4\u672C\u6B21\u521B\u5EFA\u672A\u6210\u529F");
      set({ phase: "monitoring", detail: "\u5DF2\u786E\u8BA4\u4E0A\u6B21\u521B\u5EFA\u672A\u6210\u529F\uFF0C\u7EE7\u7EED\u76D1\u6D4B" });
      return "continue";
    };
    const submit = async (task, machine, quote) => {
      if (task.createInFlight) throw new Error("a create request is already in flight");
      task.createInFlight = true;
      task.createsSent += 1;
      pending.save({ sentAt: Date.now(), machineId: machine.id, knownInstanceIds: [...task.knownInstanceIds] });
      set({ phase: "creating", detail: `\u6B63\u5728\u521B\u5EFA\uFF1A${hostLabel(machine)}` });
      log.add(
        "info",
        `\u5DF2\u53D1\u51FA\u521B\u5EFA\u8BF7\u6C42\uFF1A${hostLabel(machine)}\uFF0C${task.plan.gpuCount} \u5361\uFF0C\u6570\u636E\u76D8\u6269\u5BB9 ${task.plan.expandGb} GB`
      );
      const created = await api.createInstance({
        machineId: machine.id,
        gpuCount: task.plan.gpuCount,
        image: task.plan.image,
        expandBytes: task.plan.criteria.expandBytes
      });
      task.createInFlight = false;
      if (created.ok) return verify(task, machine, quote, created.value);
      if (created.failure.kind === "ambiguous") return reconcile(task, machine, quote);
      pending.clear();
      set({ phase: "monitoring", detail: "\u521B\u5EFA\u8BF7\u6C42\u88AB\u5E73\u53F0\u62D2\u7EDD\uFF0C\u672A\u521B\u5EFA\u5B9E\u4F8B" });
      if (created.failure.kind === "sold-out")
        log.add("info", `${hostLabel(machine)} \u5DF2\u88AB\u79DF\u5B8C\uFF0C\u672A\u521B\u5EFA\u5B9E\u4F8B\uFF0C\u7EE7\u7EED\u76D1\u6D4B`);
      else pauseTask(task, `\u521B\u5EFA\u8BF7\u6C42\u88AB\u62D2\u7EDD\uFF0C\u672A\u521B\u5EFA\u5B9E\u4F8B\uFF1A${describeFailure(created.failure)}`);
      return "continue";
    };
    const precheck = async (task, listed) => {
      const { plan } = task;
      const [machine, online, instanceCount, quote, images, instances] = await Promise.all([
        api.getMachine(listed.id, listed.regionSign),
        api.isMachineOnline(listed.id),
        api.countInstances(),
        api.previewPrice({
          machineId: listed.id,
          gpuCount: plan.gpuCount,
          expandBytes: plan.criteria.expandBytes
        }),
        api.listImages(plan.image.kind),
        api.listInstances()
      ]);
      if (!machine.ok) return machine;
      if (!online.ok) return online;
      if (!instanceCount.ok) return instanceCount;
      if (!quote.ok) return quote;
      if (!images.ok) return images;
      if (!instances.ok) return instances;
      return ok({
        machine: machine.value,
        online: online.value,
        instanceCount: instanceCount.value,
        quote: quote.value,
        images: images.value,
        instances: instances.value
      });
    };
    const attempt = async (task, listed) => {
      const { plan } = task;
      const expandBytes = plan.criteria.expandBytes;
      log.add("info", `\u53D1\u73B0\u5019\u9009\u4E3B\u673A ${hostLabel(listed)}\uFF0C\u5F00\u59CB\u521B\u5EFA\u524D\u6838\u5BF9`);
      const checked = await precheck(task, listed);
      if (!checked.ok) {
        await onReadFailure(task, checked.failure);
        return "continue";
      }
      const { machine, online, instanceCount, quote, images, instances } = checked.value;
      const strangers = instances.filter((instance) => !task.knownInstanceIds.has(instance.uuid));
      if (strangers.length > 0) return finish(task, "failed", strangerOutcome(strangers));
      const skip = (reason2) => {
        log.add("info", `${hostLabel(listed)} \u6838\u5BF9\u672A\u901A\u8FC7\uFF1A${reason2}\uFF0C\u7EE7\u7EED\u76D1\u6D4B`);
        return "continue";
      };
      const hold = (reason2) => {
        pauseTask(task, reason2);
        return "continue";
      };
      if (machine === null) return skip("\u4E3B\u673A\u5DF2\u4E0D\u5728\u5217\u8868\u4E2D");
      const reason = rejectionReason(machine, plan.criteria);
      if (reason !== null) return skip(reason);
      if (!online) return skip("\u4E3B\u673A\u6B63\u5728\u4E0B\u67B6\u7EF4\u62A4");
      const { instanceLimit } = api.getSession();
      if (instanceCount >= instanceLimit)
        return hold(`\u5B9E\u4F8B\u6570\u91CF\u5DF2\u8FBE\u4E0A\u9650\uFF08${instanceCount}/${instanceLimit}\uFF09\uFF0C\u65E0\u6CD5\u521B\u5EFA`);
      if (quote.expandBytes !== expandBytes)
        return hold(
          `\u5E73\u53F0\u4EF7\u683C\u9884\u89C8\u4E2D\u7684\u6269\u5BB9\u5927\u5C0F\uFF08${bytesToGb(quote.expandBytes)} GB\uFF09\u4E0E\u8BBE\u7F6E\uFF08${plan.expandGb} GB\uFF09\u4E0D\u4E00\u81F4\uFF0C\u672A\u521B\u5EFA\u5B9E\u4F8B`
        );
      if (quote.hourlyMilli > plan.maxHourlyMilli)
        return hold(
          `\u4EF7\u683C\u8D85\u9650\uFF1A${hostLabel(machine)} \u5B9E\u9645\u4EF7\u683C ${formatYuan(quote.hourlyMilli)}/\u65F6\uFF0C\u9AD8\u4E8E\u4E0A\u9650 ${formatYuan(plan.maxHourlyMilli)}/\u65F6\uFF0C\u672A\u521B\u5EFA\u5B9E\u4F8B`
        );
      if (!images.some((image) => image.uuid === plan.image.uuid)) return hold("\u6240\u9009\u955C\u50CF\u5DF2\u4E0D\u5B58\u5728\uFF0C\u672A\u521B\u5EFA\u5B9E\u4F8B");
      if (task.stopRequested || task.pauseReason !== null) return "continue";
      log.add(
        "info",
        `\u6838\u5BF9\u901A\u8FC7\uFF1A${hostLabel(machine)}\uFF0C${formatYuan(quote.hourlyMilli)}/\u65F6\uFF0C\u6570\u636E\u76D8\u6269\u5BB9 ${plan.expandGb} GB\uFF08${formatYuan(quote.diskDailyMilli)}/\u65E5\uFF09`
      );
      return submit(task, machine, quote);
    };
    const candidatesIn = async (task, { region, gpuNames }) => {
      const { plan } = task;
      log.add("info", `${region.name} \u7684 ${gpuNames.join("\u3001")} \u6709\u7A7A\u95F2 GPU\uFF0C\u8BFB\u53D6\u4E3B\u673A\u5217\u8868`);
      const listed = await api.listMachines({
        regionSigns: region.signs,
        gpuNames,
        gpuCount: plan.gpuCount,
        maxPages: MAX_HOST_PAGES
      });
      if (!listed.ok) return listed;
      const { machines, total, complete } = listed.value;
      if (!complete)
        log.add(
          "warn",
          `${region.name} \u5171\u6709 ${total} \u53F0\u5339\u914D\u4E3B\u673A\uFF0C\u8D85\u8FC7\u5355\u6B21\u8BFB\u53D6\u4E0A\u9650\uFF0C\u53EA\u68C0\u67E5\u4E86\u524D ${machines.length} \u53F0`
        );
      const { eligible, rejected } = selectMachines(machines, plan.criteria);
      const idle = rejected.filter((item) => item.machine.gpuIdle > 0);
      log.add(
        "info",
        `${region.name}\uFF1A${eligible.length + idle.length} \u53F0\u4E3B\u673A\u6709\u7A7A\u95F2 GPU\uFF0C${eligible.length} \u53F0\u7B26\u5408\u5168\u90E8\u6761\u4EF6`
      );
      for (const { machine, reason } of idle.slice(0, 3))
        log.add("info", `  \u8DF3\u8FC7 ${hostLabel(machine)}\uFF1A${reason}`);
      if (eligible.length === 0)
        log.add("info", `  ${region.name} \u7684\u7A7A\u95F2\u6570\u91CF\u4E0D\u53D8\u65F6\uFF0C${FRUITLESS_RECHECK_MS / 1e3} \u79D2\u540E\u518D\u590D\u67E5\u4E3B\u673A\u5217\u8868`);
      return ok(eligible);
    };
    const poll = async (task) => {
      const { plan } = task;
      const interrupted = () => task.stopRequested || task.pauseReason !== null;
      const counts = await api.countIdleGpus(plan.regions);
      if (interrupted()) return "again";
      if (!counts.ok) {
        await onReadFailure(task, counts.failure);
        return "again";
      }
      task.failures = 0;
      set({ polls: state.polls + 1 });
      const idleOf = (region, gpuName) => counts.value.find((count) => count.regionId === region.id && count.gpuName === gpuName)?.idle ?? 0;
      const hits = plan.regions.map((region) => {
        const gpuNames = plan.gpuNames.filter((name) => idleOf(region, name) >= plan.gpuCount);
        return {
          region,
          gpuNames,
          signature: gpuNames.map((name) => `${name}=${idleOf(region, name)}`).join(",")
        };
      }).filter((hit) => hit.gpuNames.length > 0);
      log.add(
        "info",
        hits.length === 0 ? `\u7B2C ${state.polls} \u6B21\u68C0\u67E5\uFF1A\u6240\u9009\u5730\u533A\u548C\u578B\u53F7\u6682\u65E0\u8DB3\u591F\u7684\u7A7A\u95F2 GPU` : `\u7B2C ${state.polls} \u6B21\u68C0\u67E5\uFF1A\u5E73\u53F0\u663E\u793A ${hits.map((hit) => hit.region.name).join("\u3001")} \u6709\u7A7A\u95F2 GPU`
      );
      let attempts = 0;
      for (const hit of hits) {
        const last = task.fruitless.get(hit.region.id);
        if (last?.signature === hit.signature && Date.now() - last.at < FRUITLESS_RECHECK_MS) continue;
        const eligible = await candidatesIn(task, hit);
        if (interrupted()) return "again";
        if (!eligible.ok) {
          await onReadFailure(task, eligible.failure);
          return "again";
        }
        if (eligible.value.length === 0)
          task.fruitless.set(hit.region.id, { signature: hit.signature, at: Date.now() });
        else task.fruitless.delete(hit.region.id);
        for (const machine of eligible.value) {
          if (attempts >= MAX_ATTEMPTS_PER_POLL) return "rest";
          attempts += 1;
          if (await attempt(task, machine) === "finished") return "finished";
          if (interrupted()) return "again";
        }
      }
      return "rest";
    };
    const run = async (task) => {
      const { plan } = task;
      for (; ; ) {
        if (task.stopRequested) {
          finish(task, "stopped", {
            headline: task.createsSent > 0 ? "\u5DF2\u505C\u6B62\u3002\u5DF2\u53D1\u51FA\u7684\u521B\u5EFA\u8BF7\u6C42\u7ECF\u6838\u5BF9\u6CA1\u6709\u751F\u6210\u5B9E\u4F8B\u3002" : "\u5DF2\u505C\u6B62\u3002\u6CA1\u6709\u53D1\u51FA\u521B\u5EFA\u8BF7\u6C42\uFF0C\u6CA1\u6709\u521B\u5EFA\u5B9E\u4F8B\u3002",
            instance: null,
            machine: null,
            quote: null,
            mayBeBilling: false
          });
          return;
        }
        if (task.pauseReason !== null) {
          set({ phase: "paused", detail: task.pauseReason });
          await task.gate.wait();
          continue;
        }
        set({ phase: "monitoring", detail: `\u76D1\u6D4B\u4E2D\uFF0C\u6BCF ${plan.intervalMs / 1e3} \u79D2\u68C0\u67E5\u4E00\u6B21` });
        const result = await poll(task);
        if (result === "finished") return;
        if (result === "rest" && !task.stopRequested && task.pauseReason === null)
          await task.gate.wait(withJitter(plan.intervalMs));
      }
    };
    const pendingBlock = (instances) => {
      const stored = pending.load();
      if (stored === null) return null;
      const fresh = instances.filter((instance) => !stored.knownInstanceIds.includes(instance.uuid));
      if (fresh.length > 0)
        return `\u4E0A\u4E00\u6B21\u4EFB\u52A1\u53D1\u51FA\u7684\u521B\u5EFA\u8BF7\u6C42\u53EF\u80FD\u5DF2\u6210\u529F\uFF1A\u5B9E\u4F8B\u5217\u8868\u4E2D\u51FA\u73B0\u4E86\u65B0\u5B9E\u4F8B ${fresh.map((instance) => instance.uuid).join("\u3001")}\uFF08\u53EF\u80FD\u6B63\u5728\u8BA1\u8D39\uFF09\u3002\u8BF7\u5148\u5230\u63A7\u5236\u53F0\u6838\u5BF9\uFF0C\u786E\u8BA4\u540E\u70B9\u51FB\u201C\u6E05\u9664\u6838\u5BF9\u6807\u8BB0\u201D\u518D\u542F\u52A8\u3002`;
      const remaining = PENDING_WINDOW_MS - (Date.now() - stored.sentAt);
      if (remaining > 0)
        return `\u4E0A\u4E00\u6B21\u521B\u5EFA\u8BF7\u6C42\u7684\u7ED3\u679C\u4ECD\u5728\u6838\u5BF9\u671F\u5185\uFF0C\u8BF7\u7EA6 ${Math.ceil(remaining / 1e3)} \u79D2\u540E\u518D\u542F\u52A8`;
      pending.clear();
      return null;
    };
    const start = async (plan) => {
      if (ACTIVE_PHASES.includes(state.phase)) return "\u4EFB\u52A1\u5DF2\u5728\u8FD0\u884C\u4E2D";
      set({ phase: "starting", detail: "\u6B63\u5728\u542F\u52A8", polls: 0, outcome: null });
      const refuse = (message) => {
        set({ phase: "idle", detail: message });
        log.add("warn", `\u672A\u80FD\u542F\u52A8\uFF1A${message}`);
        return message;
      };
      const session = api.getSession();
      if (!session.loggedIn) return refuse("\u672A\u68C0\u6D4B\u5230\u767B\u5F55\u72B6\u6001\uFF0C\u8BF7\u5148\u767B\u5F55 AutoDL");
      if (!session.canCreate) return refuse("\u5F53\u524D\u5B50\u8D26\u53F7\u6CA1\u6709\u5BB9\u5668\u5B9E\u4F8B\u6743\u9650\uFF0C\u65E0\u6CD5\u521B\u5EFA\u5B9E\u4F8B");
      const release = await lock.acquire();
      if (release === null) return refuse("\u53E6\u4E00\u4E2A\u6807\u7B7E\u9875\u6B63\u5728\u8FD0\u884C\u62A2\u673A\u4EFB\u52A1\uFF0C\u672C\u9875\u4E0D\u4F1A\u91CD\u590D\u542F\u52A8");
      const instances = await api.listInstances();
      const blocked = instances.ok ? pendingBlock(instances.value) : `\u65E0\u6CD5\u8BFB\u53D6\u5B9E\u4F8B\u5217\u8868\uFF1A${describeFailure(instances.failure)}`;
      if (!instances.ok || blocked !== null) {
        release();
        return refuse(blocked ?? "\u65E0\u6CD5\u8BFB\u53D6\u5B9E\u4F8B\u5217\u8868");
      }
      const task = {
        plan,
        knownInstanceIds: new Set(instances.value.map((instance) => instance.uuid)),
        release,
        gate: createGate(),
        stopRequested: false,
        pauseReason: null,
        createInFlight: false,
        createsSent: 0,
        ambiguousCreates: 0,
        failures: 0,
        fruitless: /* @__PURE__ */ new Map()
      };
      current = task;
      log.add("info", `\u4EFB\u52A1\u5F00\u59CB\uFF1A${describePlan(plan)}\u3002\u5F53\u524D\u5DF2\u6709 ${task.knownInstanceIds.size} \u4E2A\u5B9E\u4F8B`);
      void run(task).catch((error) => {
        finish(task, "failed", {
          headline: `\u811A\u672C\u5185\u90E8\u9519\u8BEF\uFF0C\u4EFB\u52A1\u5DF2\u505C\u6B62\uFF1A${error.message}${task.createsSent > 0 ? "\u3002\u521B\u5EFA\u8BF7\u6C42\u5DF2\u53D1\u51FA\u8FC7\uFF0C\u8BF7\u5230\u63A7\u5236\u53F0\u6838\u5BF9\uFF0C\u53EF\u80FD\u6B63\u5728\u8BA1\u8D39\u3002" : ""}`,
          instance: null,
          machine: null,
          quote: null,
          mayBeBilling: task.createsSent > 0
        });
      });
      return null;
    };
    const createAlreadySent = () => CREATE_SENT_PHASES.includes(state.phase);
    return {
      getState: () => state,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      start,
      pause: () => {
        if (current === null || current.pauseReason !== null || current.stopRequested) return;
        if (createAlreadySent()) {
          log.add("warn", "\u521B\u5EFA\u8BF7\u6C42\u5DF2\u53D1\u51FA\uFF0C\u65E0\u6CD5\u6682\u505C\uFF1B\u5C06\u7EE7\u7EED\u6838\u5BF9\u7ED3\u679C\uFF0C\u4EFB\u52A1\u7ED3\u675F\u540E\u4E0D\u4F1A\u518D\u521B\u5EFA");
          return;
        }
        current.pauseReason = "\u5DF2\u624B\u52A8\u6682\u505C";
        log.add("info", "\u5DF2\u624B\u52A8\u6682\u505C\u76D1\u6D4B");
        current.gate.wake();
      },
      resume: () => {
        if (current === null || current.pauseReason === null) return;
        current.pauseReason = null;
        current.failures = 0;
        log.add("info", "\u7EE7\u7EED\u76D1\u6D4B");
        current.gate.wake();
      },
      stop: () => {
        if (current === null || current.stopRequested) return;
        current.stopRequested = true;
        if (createAlreadySent())
          log.add("warn", "\u5DF2\u6536\u5230\u505C\u6B62\u6307\u4EE4\u3002\u521B\u5EFA\u8BF7\u6C42\u5DF2\u53D1\u51FA\uFF0C\u65E0\u6CD5\u4FDD\u8BC1\u64A4\u9500\uFF1B\u5C06\u7EE7\u7EED\u6838\u5BF9\u7ED3\u679C\uFF0C\u4F46\u4E0D\u4F1A\u518D\u53D1\u8D77\u65B0\u7684\u521B\u5EFA");
        else log.add("info", "\u5DF2\u6536\u5230\u505C\u6B62\u6307\u4EE4\uFF0C\u53D6\u6D88\u540E\u7EED\u76D1\u6D4B\u4E0E\u91CD\u8BD5");
        current.gate.wake();
      }
    };
  };

  // src/app/catalog.ts
  var loadCatalog = async (api) => {
    const [regions, gpuTypes, officialImages, privateImages, memberLevel] = await Promise.all([
      api.listRegions(),
      api.listGpuTypes(),
      api.listImages("official"),
      api.listImages("private"),
      api.getMemberLevel()
    ]);
    if (!regions.ok) return regions;
    if (!gpuTypes.ok) return gpuTypes;
    if (!officialImages.ok) return officialImages;
    const warnings = [];
    if (!privateImages.ok) warnings.push(`\u65E0\u6CD5\u8BFB\u53D6\u81EA\u5B9A\u4E49\u955C\u50CF\u5217\u8868\uFF1A${describeFailure(privateImages.failure)}`);
    if (!memberLevel.ok)
      warnings.push(
        `\u65E0\u6CD5\u8BFB\u53D6\u4F1A\u5458\u7B49\u7EA7\uFF0C\u7B5B\u9009\u65F6\u6309\u4E3B\u673A\u539F\u4EF7\u4F30\u7B97\uFF08\u521B\u5EFA\u524D\u4ECD\u4EE5\u5E73\u53F0\u9884\u89C8\u4EF7\u4E3A\u51C6\uFF09\uFF1A${describeFailure(memberLevel.failure)}`
      );
    return ok({
      catalog: {
        regions: regions.value,
        gpuTypes: gpuTypes.value,
        officialImages: officialImages.value,
        privateImages: privateImages.ok ? privateImages.value : [],
        memberLevel: memberLevel.ok ? memberLevel.value : ""
      },
      warnings
    });
  };

  // src/app/app.ts
  var ACTIVE_PHASES2 = ["starting", "monitoring", "paused", "creating", "verifying"];
  var isActive = (phase) => ACTIVE_PHASES2.includes(phase);
  var DRAFT_KEY = "autodl-grabber:draft";
  var loadDraft = (storage) => {
    const parsed = parseJson(storage.getItem(DRAFT_KEY) ?? "null");
    const draft = parsed.ok ? safeParse(DraftSchema, parsed.value) : null;
    return draft?.success ? draft.output : defaultDraft();
  };
  var createApp = (deps) => {
    const { api, runner, pending, log, storage } = deps;
    let state = {
      draft: loadDraft(storage),
      catalog: null,
      catalogError: null,
      busy: false,
      errors: [],
      runner: runner.getState(),
      pendingCreate: pending.load() !== null
    };
    const listeners = /* @__PURE__ */ new Set();
    const set = (patch) => {
      const previous = state;
      state = { ...state, ...patch };
      for (const listener of listeners) listener(state, previous);
    };
    runner.subscribe((next) => set({ runner: next, pendingCreate: pending.load() !== null }));
    const idle = () => !isActive(state.runner.phase) && !state.busy;
    return {
      getState: () => state,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      updateDraft: (patch) => {
        if (!idle()) return;
        const draft = { ...state.draft, ...patch };
        storage.setItem(DRAFT_KEY, JSON.stringify(draft));
        set({ draft, errors: [] });
      },
      reloadCatalog: async () => {
        if (!idle()) return;
        set({ busy: true, catalog: null, catalogError: null, errors: [] });
        const loaded = await loadCatalog(api);
        if (!loaded.ok) {
          const reason = describeFailure(loaded.failure);
          log.add("error", `\u8BFB\u53D6\u5730\u533A\u3001GPU \u548C\u955C\u50CF\u5217\u8868\u5931\u8D25\uFF1A${reason}`);
          set({ busy: false, catalogError: reason });
          return;
        }
        for (const warning of loaded.value.warnings) log.add("warn", warning);
        set({ busy: false, catalog: loaded.value.catalog });
      },
      start: async () => {
        if (!idle()) return;
        if (state.catalog === null) {
          set({ errors: ["\u5730\u533A\u3001GPU \u548C\u955C\u50CF\u5217\u8868\u5C1A\u672A\u52A0\u8F7D\uFF0C\u8BF7\u5148\u70B9\u51FB\u201C\u5237\u65B0\u5217\u8868\u201D"] });
          return;
        }
        if (!deps.tabLockSupported) {
          set({ errors: ["\u5F53\u524D\u6D4F\u89C8\u5668\u4E0D\u652F\u6301 Web Locks\uFF0C\u65E0\u6CD5\u4FDD\u8BC1\u591A\u6807\u7B7E\u9875\u4E0D\u91CD\u590D\u521B\u5EFA\uFF0C\u5DF2\u62D2\u7EDD\u542F\u52A8"] });
          return;
        }
        const built = buildPlan(state.draft, state.catalog);
        if (!built.ok) {
          set({ errors: built.errors });
          return;
        }
        set({ errors: [] });
        deps.requestNotifications();
        const refusal = await runner.start(built.plan);
        if (refusal !== null) set({ errors: [refusal], pendingCreate: pending.load() !== null });
      },
      pause: () => runner.pause(),
      resume: () => runner.resume(),
      stop: () => runner.stop(),
      clearPendingCreate: () => {
        if (!idle()) return;
        pending.clear();
        log.add("warn", "\u5DF2\u6309\u4F60\u7684\u786E\u8BA4\u6E05\u9664\u201C\u672A\u786E\u8BA4\u7684\u521B\u5EFA\u8BF7\u6C42\u201D\u6807\u8BB0");
        set({ pendingCreate: false, errors: [] });
      }
    };
  };

  // src/autodl/wire.ts
  var RegionList = object({
    region_list: array(
      object({
        region_sign: string(),
        region_name: string(),
        data_center: string(),
        used_for: nullish(string(), "all"),
        visible: nullish(string(), "all")
      })
    )
  });
  var HIDDEN_REGION_SIGNS = ["wave-A", "shenzhen-A"];
  var toRegions = (raw) => {
    const regions = /* @__PURE__ */ new Map();
    for (const item of raw.region_list) {
      if (item.used_for !== "all" || item.visible !== "all" || HIDDEN_REGION_SIGNS.includes(item.region_sign))
        continue;
      const region = regions.get(item.data_center) ?? {
        id: item.data_center,
        name: item.region_name,
        signs: []
      };
      region.signs.push(item.region_sign);
      regions.set(item.data_center, region);
    }
    return [...regions.values()];
  };
  var GpuTypeList = array(
    object({
      gpu_name: string(),
      chip_corp: nullish(string(), ""),
      cpu_arch: nullish(string(), ""),
      gpu_series_type: nullish(string(), "")
    })
  );
  var toGpuTypes = (raw) => raw.map((item) => ({
    name: item.gpu_name,
    chipCorp: item.chip_corp,
    cpuArch: item.cpu_arch,
    series: item.gpu_series_type
  }));
  var MemberDetail = object({ member_level: string() });
  var RegionGpuIdle = nullish(array(record(string(), object({ idle_gpu_num: number() }))), []);
  var toIdleByGpu = (raw) => Object.fromEntries(
    raw.flatMap((row) => Object.entries(row).map(([name, value]) => [name, Math.max(value.idle_gpu_num, 0)]))
  );
  var ImageLeaf = object({ uuid: string(), v: string(), chip_corp: string(), cpu_arch: string() });
  var ImageNode = object({
    label_name: union([string(), ImageLeaf]),
    children: optional(nullable(array(lazy(() => ImageNode))))
  });
  var OfficialImageTree = array(ImageNode);
  var toOfficialImages = (nodes, trail = []) => nodes.flatMap((node) => {
    if (typeof node.label_name === "string")
      return toOfficialImages(node.children ?? [], [...trail, node.label_name]);
    const leaf = node.label_name;
    const runtime = leaf.chip_corp === "nvidia" ? `CUDA ${leaf.v}` : `${leaf.chip_corp} ${leaf.v}`;
    return [
      {
        kind: "official",
        uuid: leaf.uuid,
        label: [...trail, runtime].join(" / "),
        cuda: leaf.v,
        chipCorp: leaf.chip_corp,
        cpuArch: leaf.cpu_arch
      }
    ];
  });
  var PrivateImageList = nullish(
    array(
      object({
        image_uuid: string(),
        name: string(),
        cuda_v: nullish(union([string(), number()]), ""),
        chip_corp: nullish(string(), ""),
        cpu_arch: nullish(string(), "")
      })
    ),
    []
  );
  var toPrivateImages = (raw) => raw.map((item) => ({
    kind: "private",
    uuid: item.image_uuid,
    label: item.name,
    cuda: String(item.cuda_v),
    chipCorp: item.chip_corp,
    cpuArch: item.cpu_arch
  }));
  var RawMachine = object({
    machine_id: string(),
    machine_alias: nullish(string(), ""),
    region_sign: string(),
    region_name: nullish(string(), ""),
    gpu_name: string(),
    gpu_number: number(),
    gpu_idle_num: number(),
    on_line: number(),
    max_instance_num: number(),
    binding_instance_num: number(),
    payg: boolean(),
    payg_price: number(),
    machine_sku_info: nullish(
      array(
        object({
          type: string(),
          level_config: nullish(array(object({ level_name: string(), discounted_price: number() })), [])
        })
      ),
      []
    ),
    chip_corp: nullish(string(), ""),
    cpu_arch: nullish(string(), ""),
    highest_cuda_version: nullish(string(), ""),
    rent_mode: nullish(string(), ""),
    max_instance_disk_size: number(),
    max_data_disk_expand_size: number(),
    data_disk_expand_price: object({ daily_price: number() })
  });
  var MachinePage = object({
    list: nullish(array(RawMachine), []),
    result_total: number(),
    max_page: number()
  });
  var SOLD_OUT_STATES = [3, 4, 5, 6];
  var toMachine = (raw) => {
    const rentable = raw.payg && !SOLD_OUT_STATES.includes(raw.on_line) && raw.max_instance_num > raw.binding_instance_num;
    const paygSku = raw.machine_sku_info.find((sku) => sku.type === "payg");
    return {
      id: raw.machine_id,
      alias: raw.machine_alias,
      regionSign: raw.region_sign,
      regionName: raw.region_name,
      gpuName: raw.gpu_name,
      gpuTotal: raw.gpu_number,
      gpuIdle: rentable ? Math.max(raw.gpu_idle_num, 0) : 0,
      chipCorp: raw.chip_corp,
      cpuArch: raw.cpu_arch,
      highestCuda: raw.highest_cuda_version,
      rentMode: raw.rent_mode,
      hourlyMilli: raw.payg_price,
      hourlyMilliByLevel: Object.fromEntries(
        (paygSku?.level_config ?? []).map((level) => [level.level_name, level.discounted_price])
      ),
      freeDiskBytes: raw.max_instance_disk_size,
      maxExpandBytes: raw.max_data_disk_expand_size,
      diskDailyMilliPerGb: raw.data_disk_expand_price.daily_price
    };
  };
  var PricePreview = object({
    payg_price: number(),
    origin_price: number(),
    expand_data_disk: number(),
    data_disk_info: object({ data_disk_deal_daily_price: number() })
  });
  var toPriceQuote = (raw) => ({
    hourlyMilli: raw.payg_price,
    originHourlyMilli: raw.origin_price,
    expandBytes: raw.expand_data_disk,
    diskDailyMilli: raw.data_disk_info.data_disk_deal_daily_price
  });
  var RawInstance = object({
    uuid: string(),
    machine_id: string(),
    region_name: nullish(string(), ""),
    snapshot_gpu_alias_name: nullish(string(), ""),
    req_gpu_amount: nullish(number(), 0),
    status: string(),
    charge_type: nullish(string(), ""),
    payg_price: nullish(number(), 0),
    expand_data_disk_size: number(),
    usage_info: nullish(object({ data_disk_total_size: nullish(number(), 0) }), { data_disk_total_size: 0 }),
    created_at: nullish(string(), "")
  });
  var InstancePage = object({ list: nullish(array(RawInstance), []) });
  var toInstance = (raw) => ({
    uuid: raw.uuid,
    machineId: raw.machine_id,
    regionName: raw.region_name,
    gpuName: raw.snapshot_gpu_alias_name,
    gpuCount: raw.req_gpu_amount,
    status: raw.status,
    chargeType: raw.charge_type,
    hourlyMilli: raw.payg_price,
    expandBytes: raw.expand_data_disk_size,
    dataDiskTotalBytes: raw.usage_info.data_disk_total_size,
    createdAt: raw.created_at
  });

  // src/autodl/api.ts
  var ENDPOINTS = {
    common: "api/v1/common",
    gpuTypes: "api/v1/machine/gpu_type",
    memberDetail: "api/v1/user/member/detail",
    officialImages: "api/v1/image/all",
    privateImages: "api/v1/image/private/get",
    regionGpuIdle: "api/v1/machine/region/gpu_type",
    machines: "api/v1/user/machine/list",
    machineOnline: "api/v1/machine/check_machine_online",
    instanceCount: "api/v1/instance/count/v1",
    pricePreview: "api/v1/order/price/preview",
    createPayg: "api/v1/order/instance/create/payg",
    instances: "api/v1/instance"
  };
  var MACHINE_PAGE_SIZE = 100;
  var INSTANCE_PAGE_SIZE = 100;
  var CREATE_TIMEOUT_MS = 3e4;
  var DEFAULT_INSTANCE_LIMIT = 50;
  var StoredUser2 = object({
    sub_name: nullish(string(), ""),
    instance: nullish(string(), ""),
    instance_limit: nullish(number(), 0)
  });
  var readSession = (storage) => {
    const loggedIn = (storage.getItem(STORAGE_KEYS.token) ?? "") !== "";
    const parsed = parseJson(storage.getItem(STORAGE_KEYS.user) ?? "null");
    const user = parsed.ok ? safeParse(StoredUser2, parsed.value) : null;
    if (!user?.success) return { loggedIn, canCreate: loggedIn, instanceLimit: DEFAULT_INSTANCE_LIMIT };
    const { instance, instance_limit } = user.output;
    return {
      loggedIn,
      // The create page refuses sub-accounts whose "instance" permission is empty or "no_permission".
      canCreate: !isSubAccount(storage) || instance !== "" && instance !== "no_permission",
      instanceLimit: instance_limit > 0 ? instance_limit : DEFAULT_INSTANCE_LIMIT
    };
  };
  var machineQuery = (overrides) => ({
    charge_type: "payg",
    region_sign: "",
    region_sign_list: [],
    gpu_type_name: [],
    machine_tag_name: [],
    gpu_idle_num: 1,
    mount_net_disk: false,
    instance_disk_size_order: "",
    date_range: "",
    date_from: "",
    date_to: "",
    pay_price_order: "",
    gpu_idle_type: "",
    default_order: true,
    cpu_arch: [],
    chip_corp: [],
    page_index: 1,
    page_size: 10,
    ...overrides
  });
  var createAutodlApi = (deps) => {
    const http = createHttp(deps);
    return {
      getSession: () => readSession(deps.storage),
      listRegions: async () => {
        const result = await http({ method: "GET", path: ENDPOINTS.common, data: RegionList });
        return result.ok ? ok(toRegions(result.value)) : result;
      },
      listGpuTypes: async () => {
        const result = await http({ method: "GET", path: ENDPOINTS.gpuTypes, data: GpuTypeList });
        return result.ok ? ok(toGpuTypes(result.value)) : result;
      },
      getMemberLevel: async () => {
        const result = await http({ method: "GET", path: ENDPOINTS.memberDetail, data: MemberDetail });
        return result.ok ? ok(result.value.member_level) : result;
      },
      listImages: async (kind) => {
        const body = { cpu_arch: [], chip_corp: [] };
        if (kind === "official") {
          const result2 = await http({
            method: "POST",
            path: ENDPOINTS.officialImages,
            body,
            data: OfficialImageTree
          });
          return result2.ok ? ok(toOfficialImages(result2.value)) : result2;
        }
        const result = await http({
          method: "POST",
          path: ENDPOINTS.privateImages,
          body,
          data: PrivateImageList
        });
        return result.ok ? ok(toPrivateImages(result.value)) : result;
      },
      // The market page sends one request per region, so this does too, one after the other.
      countIdleGpus: async (regions) => {
        const counts = [];
        for (const region of regions) {
          const result = await http({
            method: "POST",
            path: ENDPOINTS.regionGpuIdle,
            body: { region_sign_list: region.signs },
            data: RegionGpuIdle
          });
          if (!result.ok) return result;
          for (const [gpuName, idle] of Object.entries(toIdleByGpu(result.value)))
            counts.push({ regionId: region.id, gpuName, idle });
        }
        return ok(counts);
      },
      // Pages are read one after the other. The platform's order puts most rentable hosts early but not
      // all of them (observed 2026-11-13), and its sort parameters made no difference, so finding every
      // rentable host means reading every page.
      listMachines: async ({ regionSigns, gpuNames, gpuCount, maxPages }) => {
        const machines = [];
        let total = 0;
        let complete = false;
        for (let page = 1; page <= maxPages && !complete; page += 1) {
          const result = await http({
            method: "POST",
            path: ENDPOINTS.machines,
            body: machineQuery({
              region_sign_list: regionSigns,
              gpu_type_name: gpuNames,
              gpu_idle_num: gpuCount,
              page_index: page,
              page_size: MACHINE_PAGE_SIZE
            }),
            data: MachinePage
          });
          if (!result.ok) return result;
          machines.push(...result.value.list.map(toMachine));
          total = result.value.result_total;
          complete = page >= result.value.max_page;
        }
        return ok({ machines, total, complete });
      },
      getMachine: async (machineId, regionSign) => {
        const result = await http({
          method: "POST",
          path: ENDPOINTS.machines,
          body: machineQuery({ region_sign_list: [regionSign], machine_id: machineId }),
          data: MachinePage
        });
        if (!result.ok) return result;
        const found = result.value.list.find((machine) => machine.machine_id === machineId);
        return ok(found === void 0 ? null : toMachine(found));
      },
      isMachineOnline: async (machineId) => {
        const result = await http({
          method: "POST",
          path: ENDPOINTS.machineOnline,
          body: { machine_id: machineId },
          data: number()
        });
        return result.ok ? ok(result.value !== 0 && result.value !== 1) : result;
      },
      countInstances: () => http({ method: "GET", path: ENDPOINTS.instanceCount, data: number() }),
      previewPrice: async ({ machineId, gpuCount, expandBytes }) => {
        const result = await http({
          method: "POST",
          path: ENDPOINTS.pricePreview,
          body: {
            charge_type: "payg",
            coupon_id_list: [],
            duration: 1,
            expand_data_disk: expandBytes,
            machine_id: machineId,
            num: gpuCount
          },
          data: PricePreview
        });
        return result.ok ? ok(toPriceQuote(result.value)) : result;
      },
      // The body is the one the create page sends for "基础镜像" / "我的镜像" with pay-as-you-go billing.
      // The data disk expansion is part of this request: expand_data_disk is the extra size in bytes.
      createInstance: ({ machineId, gpuCount, image, expandBytes }) => http({
        method: "POST",
        path: ENDPOINTS.createPayg,
        body: {
          instance_info: {
            machine_id: machineId,
            charge_type: "payg",
            req_gpu_amount: gpuCount,
            base_image_uuid: image.kind === "official" ? image.uuid : "",
            private_image_uuid: image.kind === "private" ? image.uuid : "",
            reproduction_uuid: "",
            cg_application_uuid: "",
            cg_application_info: { image_name: "", current_version_id: 0, current_version: "", image_id: 0 },
            instance_name: "",
            expand_data_disk: expandBytes,
            reproduction_id: 0
          },
          price_info: {
            coupon_id_list: [],
            machine_id: machineId,
            charge_type: "payg",
            duration: 1,
            num: gpuCount,
            expand_data_disk: expandBytes
          }
        },
        data: string(),
        uncertain: "ambiguous",
        timeoutMs: CREATE_TIMEOUT_MS
      }),
      listInstances: async () => {
        const result = await http({
          method: "POST",
          path: ENDPOINTS.instances,
          body: {
            page_index: 1,
            page_size: INSTANCE_PAGE_SIZE,
            status: [],
            charge_type: [],
            sub_name: "",
            unbind_sub_user: false
          },
          data: InstancePage
        });
        return result.ok ? ok(result.value.list.map(toInstance)) : result;
      }
    };
  };

  // src/runner/lock.ts
  var createWebTabLock = (locks, name) => ({
    acquire: () => new Promise((resolve) => {
      void locks.request(name, { ifAvailable: true }, (lock) => {
        if (lock === null) {
          resolve(null);
          return;
        }
        return new Promise((release) => resolve(release));
      });
    })
  });

  // src/runner/log.ts
  var HIDDEN = "[\u5DF2\u9690\u85CF]";
  var JWT = /[\w-]{12,}\.[\w-]{12,}\.[\w-]{12,}/g;
  var SECRET_FIELD = /(authorization|token|cookie|passw(?:or)?d|secret)(["'\s:=]+)([^\s"',;&}]+)/gi;
  var redact = (text) => text.replace(JWT, HIDDEN).replace(SECRET_FIELD, (_match, name, separator) => `${name}${separator}${HIDDEN}`);
  var createLog = (limit = 300) => {
    let entries = [];
    const listeners = /* @__PURE__ */ new Set();
    const publish = () => {
      for (const listener of listeners) listener();
    };
    return {
      add: (level, text) => {
        entries = [...entries, { at: Date.now(), level, text: redact(text) }].slice(-limit);
        publish();
      },
      entries: () => entries,
      clear: () => {
        entries = [];
        publish();
      },
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    };
  };

  // src/runner/pending.ts
  var PendingSchema = object({ sentAt: number(), machineId: string(), knownInstanceIds: array(string()) });
  var createStoredPending = (storage, key) => ({
    load: () => {
      const parsed = parseJson(storage.getItem(key) ?? "null");
      const pending = parsed.ok ? safeParse(PendingSchema, parsed.value) : null;
      return pending?.success ? pending.output : null;
    },
    save: (pending) => storage.setItem(key, JSON.stringify(pending)),
    clear: () => storage.removeItem(key)
  });

  // src/ui/dom.ts
  var h = (tag, props = {}, children = []) => {
    const element = document.createElement(tag);
    if (props.class !== void 0) element.className = props.class;
    if (props.text !== void 0) element.textContent = props.text;
    for (const [name, value] of Object.entries(props.attrs ?? {})) element.setAttribute(name, value);
    for (const [type, listener] of Object.entries(props.on ?? {})) element.addEventListener(type, listener);
    element.append(...children);
    return element;
  };

  // src/ui/format.ts
  var EXPAND_MEANING = "\u586B\u5199\u7684\u662F\u5728\u4E3B\u673A\u81EA\u5E26\u7684\u514D\u8D39\u6570\u636E\u76D8\u4E4B\u5916\u201C\u989D\u5916\u589E\u52A0\u201D\u7684\u4ED8\u8D39\u5BB9\u91CF\uFF0C\u4E0D\u662F\u6269\u5BB9\u540E\u7684\u603B\u5BB9\u91CF\uFF08\u603B\u5BB9\u91CF = \u514D\u8D39\u6570\u636E\u76D8 + \u6B64\u5904\u586B\u5199\u7684\u5927\u5C0F\uFF09\u3002";
  var EXPAND_RULES = "\u89C4\u5219\u4E0E AutoDL \u521B\u5EFA\u9875\u4E00\u81F4\uFF1A\u6574\u6570 GB\uFF0C\u6700\u5C0F 0\uFF080 \u8868\u793A\u4E0D\u6269\u5BB9\uFF09\uFF0C\u6B65\u957F 1\uFF0C\u4E0A\u9650\u4E3A\u6240\u9009\u4E3B\u673A\u7684\u201C\u53EF\u6269\u5BB9\u201D\u7A7A\u95F4\u3002\u53EF\u6269\u5BB9\u7A7A\u95F4\u4E0D\u8DB3\u7684\u4E3B\u673A\u4F1A\u88AB\u8DF3\u8FC7\uFF0C\u4E0D\u4F1A\u6539\u7528\u66F4\u5C0F\u7684\u5BB9\u91CF\u3002";
  var START_NOTICE = "\u70B9\u51FB\u201C\u5F00\u59CB\u81EA\u52A8\u62A2\u673A\u201D\u540E\u7ACB\u5373\u5F00\u59CB\u76D1\u6D4B\uFF0C\u4E0D\u518D\u5F39\u51FA\u786E\u8BA4\u3002\u53D1\u73B0\u7B26\u5408\u6761\u4EF6\u7684\u4E3B\u673A\u4F1A\u76F4\u63A5\u521B\u5EFA\u5E76\u5F00\u673A\u4E00\u53F0\u6309\u91CF\u8BA1\u8D39\u5B9E\u4F8B\uFF0C\u968F\u5373\u5F00\u59CB\u8BA1\u8D39\uFF1B\u4E00\u6B21\u4EFB\u52A1\u6700\u591A\u521B\u5EFA\u4E00\u53F0\u3002";
  var EXPAND_FEE_NOTE = "\u6269\u5BB9\u8D39\u7528\uFF1A\u627E\u5230\u4E3B\u673A\u540E\uFF0C\u5E73\u53F0\u7ED9\u51FA\u7684\u9884\u89C8\u4EF7\u4F1A\u5199\u5165\u8FD0\u884C\u65E5\u5FD7\u5E76\u663E\u793A\u5728\u7ED3\u679C\u91CC\uFF1B\u53D6\u4E0D\u5230\u65F6\u663E\u793A\u201C\u672A\u77E5\u201D\u3002\u6309\u91CF\u8BA1\u8D39\u5B9E\u4F8B\u7684\u4ED8\u8D39\u6570\u636E\u76D8\u6309\u65E5\u6263\u8D39\uFF0C\u5173\u673A\u671F\u95F4\u4E5F\u8BA1\u8D39\u3002";
  var PHASE_LABELS = {
    idle: "\u672A\u5F00\u59CB",
    starting: "\u6B63\u5728\u542F\u52A8",
    monitoring: "\u76D1\u6D4B\u4E2D",
    paused: "\u5DF2\u6682\u505C",
    creating: "\u6B63\u5728\u521B\u5EFA\uFF08\u8BF7\u6C42\u5DF2\u53D1\u51FA\uFF09",
    verifying: "\u6B63\u5728\u6838\u5BF9\u521B\u5EFA\u7ED3\u679C",
    done: "\u5DF2\u5B8C\u6210",
    stopped: "\u5DF2\u505C\u6B62",
    failed: "\u5DF2\u505C\u6B62\uFF08\u9700\u8981\u5904\u7406\uFF09"
  };
  var outcomePairs = (outcome) => {
    const { instance, machine, quote } = outcome;
    const pairs = [];
    if (instance !== null) {
      const free = machine?.freeDiskBytes;
      const total = instance.dataDiskTotalBytes > 0 ? instance.dataDiskTotalBytes : (free ?? 0) + instance.expandBytes;
      pairs.push(
        ["\u5B9E\u4F8B ID", instance.uuid],
        ["\u72B6\u6001", instance.status],
        ["GPU", `${instance.gpuName} \xD7 ${instance.gpuCount} \u5361`],
        [
          "\u5730\u533A",
          `${instance.regionName}${machine === null ? "" : ` / ${machine.alias}`}\uFF08\u4E3B\u673A ${instance.machineId}\uFF09`
        ],
        [
          "\u6570\u636E\u76D8",
          free === void 0 ? `\u4ED8\u8D39\u6269\u5BB9 ${bytesToGb(instance.expandBytes)} GB` : `\u514D\u8D39 ${formatGb(free)} + \u4ED8\u8D39\u6269\u5BB9 ${formatGb(instance.expandBytes)} = \u5171 ${formatGb(total)}`
        ],
        ["\u5B9E\u4F8B\u8D39\u7528", `${formatYuan(instance.hourlyMilli)}/\u65F6\uFF08\u5B9E\u4F8B\u5217\u8868\u8FD4\u56DE\u7684\u5B9E\u4ED8\u5355\u4EF7\uFF09`]
      );
    } else if (machine !== null) {
      pairs.push(
        ["\u76EE\u6807\u4E3B\u673A", `${machine.regionName} / ${machine.alias}\uFF08${machine.id}\uFF09`],
        ["GPU", machine.gpuName]
      );
      if (quote !== null) pairs.push(["\u5B9E\u4F8B\u8D39\u7528", `${formatYuan(quote.hourlyMilli)}/\u65F6\uFF08\u5E73\u53F0\u9884\u89C8\u4EF7\uFF09`]);
    }
    if (quote !== null)
      pairs.push([
        "\u6570\u636E\u76D8\u8D39\u7528",
        quote.expandBytes === 0 ? "\u65E0\uFF08\u672A\u6269\u5BB9\uFF09" : `${formatYuan(quote.diskDailyMilli)}/\u65E5\uFF08\u521B\u5EFA\u524D\u7684\u5E73\u53F0\u9884\u89C8\u4EF7\uFF09`
      ]);
    else if (instance !== null) pairs.push(["\u6570\u636E\u76D8\u8D39\u7528", "\u672A\u77E5\uFF08\u6CA1\u6709\u53D6\u5F97\u5E73\u53F0\u9884\u89C8\u4EF7\uFF09\uFF0C\u8BF7\u5230\u63A7\u5236\u53F0\u67E5\u770B"]);
    return pairs;
  };

  // src/ui/styles.ts
  var STYLES = `
:host { all: initial; }
* { box-sizing: border-box; }
.panel {
  /* Clear of the page's own controls: the create page keeps "\u521B\u5EFA\u5E76\u5F00\u673A" in a fixed 90px bar at the
     bottom, and the site header is 60px high. */
  position: fixed; right: 16px; bottom: 104px; z-index: 2147483000;
  width: 400px; max-height: calc(100vh - 180px); display: flex; flex-direction: column;
  font: 13px/1.5 system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; color: #1f2329;
  background: #fff; border: 1px solid #d0d7de; border-radius: 10px; box-shadow: 0 8px 28px rgba(15, 23, 42, .18);
}
.head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; cursor: pointer; user-select: none; }
.head .title { font-weight: 600; flex: 1; }
.body { overflow-y: auto; padding: 0 12px 12px; border-top: 1px solid #eaecf0; }
.collapsed { width: auto; }
.collapsed .body { display: none; }
fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
.field { margin-top: 10px; }
.field > label, .label { display: block; font-weight: 600; margin-bottom: 4px; }
.hint { color: #667085; font-size: 12px; margin-top: 3px; }
.warn { color: #b54708; }
.danger { color: #b42318; }
.row { display: flex; gap: 8px; align-items: center; }
.row > * { min-width: 0; }
input[type="number"], select {
  width: 100%; height: 30px; padding: 0 8px; font: inherit; color: inherit;
  border: 1px solid #d0d7de; border-radius: 6px; background: #fff;
}
input:disabled, select:disabled, button:disabled { opacity: .55; cursor: not-allowed; }
.box { border: 1px solid #eaecf0; border-radius: 6px; padding: 6px 8px; max-height: 132px; overflow-y: auto; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 8px; }
.check { display: flex; align-items: center; gap: 6px; }
.region { display: flex; align-items: center; gap: 6px; padding: 1px 0; }
.region .name { flex: 1; }
.rank { color: #175cd3; font-weight: 600; min-width: 18px; }
button {
  font: inherit; height: 30px; padding: 0 12px; border-radius: 6px; cursor: pointer;
  border: 1px solid #d0d7de; background: #fff; color: #1f2329;
}
button.small { height: 22px; padding: 0 6px; font-size: 12px; }
button.primary { background: #175cd3; border-color: #175cd3; color: #fff; }
button.stop { border-color: #f0b4ae; color: #b42318; }
.actions { display: flex; gap: 8px; margin-top: 12px; }
.actions button { flex: 1; }
.errors { margin-top: 10px; padding: 8px; border-radius: 6px; background: #fef3f2; color: #b42318; }
.errors div + div { margin-top: 4px; }
.status { margin-top: 12px; padding: 8px; border-radius: 6px; background: #f6f8fa; }
.status .phase { font-weight: 600; }
.outcome { margin-top: 8px; padding: 8px; border-radius: 6px; border: 1px solid #d0d7de; }
.outcome.billing { border-color: #f0b4ae; background: #fff8f7; }
.kv { display: grid; grid-template-columns: 76px 1fr; gap: 2px 8px; margin-top: 6px; }
.kv dt { color: #667085; }
.kv dd { margin: 0; word-break: break-all; }
.log { margin-top: 6px; height: 150px; overflow-y: auto; padding: 6px 8px; border-radius: 6px;
  background: #101828; color: #e4e7ec; font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.log .warn { color: #fec84b; }
.log .error { color: #fda29b; }
.log .time { color: #98a2b3; margin-right: 6px; }
`;

  // src/ui/panel.ts
  var readNumber = (input) => input.value.trim() === "" ? Number.NaN : Number(input.value);
  var numberInput = (value, attrs, onValue) => {
    const input = h("input", {
      attrs: { type: "number", ...attrs },
      on: { input: () => onValue(readNumber(input)) }
    });
    input.value = Number.isNaN(value) ? "" : String(value);
    return input;
  };
  var select = (options, value, onValue) => {
    const element = h(
      "select",
      {
        on: {
          change: () => {
            const chosen = options.find(([optionValue]) => optionValue === element.value);
            if (chosen !== void 0) onValue(chosen[0]);
          }
        }
      },
      options.map(([optionValue, label]) => h("option", { text: label, attrs: { value: optionValue } }))
    );
    element.value = value;
    return element;
  };
  var field = (label, children) => h("div", { class: "field" }, [h("span", { class: "label", text: label }), ...children]);
  var pairList = (pairs) => h(
    "dl",
    { class: "kv" },
    pairs.flatMap(([label, value]) => [h("dt", { text: label }), h("dd", { text: value })])
  );
  var toggled = (list, item, on) => on ? [...list.filter((other) => other !== item), item] : list.filter((other) => other !== item);
  var moved = (list, index, offset) => {
    const target = index + offset;
    const next = [...list];
    const [item] = next.splice(index, 1);
    if (item === void 0 || target < 0 || target >= list.length) return list;
    next.splice(target, 0, item);
    return next;
  };
  var mountPanel = (app, log, hostId, startCollapsed) => {
    const host = h("div", { attrs: { id: hostId } });
    const shadow = host.attachShadow({ mode: "open" });
    const panel = h("div", { class: "panel" });
    shadow.append(h("style", { text: STYLES }), panel);
    const collapse = h("span", { class: "hint", text: "\u6536\u8D77" });
    const setCollapsed = (collapsed) => {
      panel.classList.toggle("collapsed", collapsed);
      collapse.textContent = collapsed ? "\u5C55\u5F00" : "\u6536\u8D77";
    };
    const head = h(
      "div",
      { class: "head", on: { click: () => setCollapsed(!panel.classList.contains("collapsed")) } },
      [h("span", { class: "title", text: "AutoDL \u81EA\u52A8\u62A2\u673A\u52A9\u624B" }), collapse]
    );
    const form = h("fieldset");
    const errors = h("div");
    const startButton = h("button", {
      class: "primary",
      text: "\u5F00\u59CB\u81EA\u52A8\u62A2\u673A",
      on: { click: () => void app.start() }
    });
    const pauseButton = h("button", {
      text: "\u6682\u505C",
      on: { click: () => app.getState().runner.phase === "paused" ? app.resume() : app.pause() }
    });
    const stopButton = h("button", { class: "stop", text: "\u505C\u6B62", on: { click: () => app.stop() } });
    const status = h("div");
    const logBox = h("div", { class: "log" });
    panel.append(
      head,
      h("div", { class: "body" }, [
        form,
        errors,
        h("div", { class: "hint warn", attrs: { style: "margin-top:12px" }, text: START_NOTICE }),
        h("div", { class: "actions", attrs: { style: "margin-top:6px" } }, [
          startButton,
          pauseButton,
          stopButton
        ]),
        status,
        h("div", { class: "field" }, [
          h("div", { class: "row" }, [
            h("span", { class: "label", text: "\u8FD0\u884C\u65E5\u5FD7" }),
            h("button", { class: "small", text: "\u6E05\u7A7A", on: { click: () => log.clear() } })
          ]),
          logBox
        ])
      ])
    );
    const gpuField = (state, catalog) => {
      const known = catalog.gpuTypes.map((gpu) => gpu.name);
      const stale = state.draft.gpuNames.filter((name) => !known.includes(name));
      const checkbox = (name, label) => {
        const input = h("input", {
          attrs: { type: "checkbox" },
          on: {
            change: () => app.updateDraft({ gpuNames: toggled(app.getState().draft.gpuNames, name, input.checked) })
          }
        });
        input.checked = state.draft.gpuNames.includes(name);
        return h("label", { class: "check" }, [input, label]);
      };
      return field("GPU \u578B\u53F7\uFF08\u53EF\u591A\u9009\uFF0C\u4EFB\u4E00\u578B\u53F7\u6709\u8D27\u5373\u53EF\uFF09", [
        h("div", { class: "box grid" }, [
          ...stale.map((name) => checkbox(name, `${name}\uFF08\u5DF2\u4E0D\u5B58\u5728\uFF09`)),
          ...known.map((name) => checkbox(name, name))
        ])
      ]);
    };
    const regionField = (state, catalog) => {
      const selected = state.draft.regionIds;
      const nameOf = (id) => catalog.regions.find((region) => region.id === id)?.name ?? `${id}\uFF08\u5DF2\u4E0D\u5B58\u5728\uFF09`;
      const row = (id, index) => {
        const input = h("input", {
          attrs: { type: "checkbox" },
          on: {
            change: () => app.updateDraft({ regionIds: toggled(app.getState().draft.regionIds, id, input.checked) })
          }
        });
        input.checked = index >= 0;
        const move = (label, offset) => h("button", {
          class: "small",
          text: label,
          attrs: { type: "button" },
          on: {
            click: () => app.updateDraft({ regionIds: moved(app.getState().draft.regionIds, index, offset) })
          }
        });
        return h("div", { class: "region" }, [
          input,
          h("span", { class: "rank", text: index >= 0 ? `${index + 1}.` : "" }),
          h("span", { class: "name", text: nameOf(id) }),
          ...index >= 0 ? [move("\u4E0A\u79FB", -1), move("\u4E0B\u79FB", 1)] : []
        ]);
      };
      const others = catalog.regions.filter((region) => !selected.includes(region.id));
      return field("\u5730\u533A\uFF08\u52FE\u9009\u540E\u6309\u5E8F\u53F7\u51B3\u5B9A\u4F18\u5148\u7EA7\uFF0C1 \u6700\u4F18\u5148\uFF09", [
        h("div", { class: "box" }, [...selected.map(row), ...others.map((region) => row(region.id, -1))])
      ]);
    };
    const imageField = (state, catalog) => {
      const { imageKind, imageUuid } = state.draft;
      const images = imageKind === "official" ? catalog.officialImages : catalog.privateImages;
      const known = images.some((image) => image.uuid === imageUuid);
      const placeholder = images.length === 0 ? "\uFF08\u6CA1\u6709\u53EF\u7528\u955C\u50CF\uFF09" : imageUuid !== "" && !known ? "\u539F\u5148\u9009\u62E9\u7684\u955C\u50CF\u5DF2\u4E0D\u5B58\u5728\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9" : "\u8BF7\u9009\u62E9\u955C\u50CF";
      return field("\u955C\u50CF", [
        h("div", { class: "row" }, [
          select(
            [
              ["official", "\u5B98\u65B9\u955C\u50CF"],
              ["private", "\u6211\u7684\u81EA\u5B9A\u4E49\u955C\u50CF"]
            ],
            imageKind,
            (kind) => app.updateDraft({ imageKind: kind, imageUuid: "" })
          )
        ]),
        h("div", { class: "row", attrs: { style: "margin-top:6px" } }, [
          select(
            [["", placeholder], ...images.map((image) => [image.uuid, image.label])],
            known ? imageUuid : "",
            (uuid) => app.updateDraft({ imageUuid: uuid })
          )
        ]),
        h("div", {
          class: "hint",
          text: "\u5B98\u65B9\u955C\u50CF\u662F AutoDL \u7684\u57FA\u7840\u955C\u50CF\uFF1B\u81EA\u5B9A\u4E49\u955C\u50CF\u662F\u4F60\u5728\u201C\u6211\u7684\u955C\u50CF\u201D\u91CC\u4FDD\u5B58\u7684\u955C\u50CF\u3002\u955C\u50CF\u7684 CUDA \u7248\u672C\u4E0E\u4E3B\u673A\u4E0D\u517C\u5BB9\u65F6\u4F1A\u8DF3\u8FC7\u8BE5\u4E3B\u673A\u3002"
        })
      ]);
    };
    const renderForm = (state) => {
      const { draft, catalog } = state;
      const children = [];
      if (catalog === null) {
        children.push(
          h("div", { class: "field" }, [
            h("div", {
              class: state.catalogError === null ? "hint" : "danger",
              text: state.catalogError === null ? "\u6B63\u5728\u8BFB\u53D6\u5730\u533A\u3001GPU \u548C\u955C\u50CF\u5217\u8868\u2026" : `\u8BFB\u53D6\u5217\u8868\u5931\u8D25\uFF1A${state.catalogError}`
            })
          ])
        );
      } else {
        children.push(
          gpuField(state, catalog),
          field("GPU \u6570\u91CF\uFF08\u5361\uFF09", [
            numberInput(
              draft.gpuCount,
              { min: "1", max: "12", step: "1" },
              (gpuCount) => app.updateDraft({ gpuCount })
            )
          ]),
          regionField(state, catalog),
          field("\u6BCF\u5C0F\u65F6\u4EF7\u683C\u4E0A\u9650\uFF08\u5143/\u65F6\uFF09", [
            numberInput(
              draft.maxHourlyYuan,
              { min: "0", step: "0.01" },
              (maxHourlyYuan) => app.updateDraft({ maxHourlyYuan })
            ),
            h("div", {
              class: "hint",
              text: "\u6307\u6574\u53F0\u5B9E\u4F8B\uFF08\u5168\u90E8 GPU\uFF09\u6BCF\u5C0F\u65F6\u7684\u5B9E\u4ED8\u4EF7\u683C\uFF0C\u5DF2\u542B\u4F1A\u5458\u6298\u6263\uFF0C\u4E0D\u542B\u6570\u636E\u76D8\u8D39\u7528\u3002\u521B\u5EFA\u524D\u4EE5\u5E73\u53F0\u4EF7\u683C\u9884\u89C8\u4E3A\u51C6\u3002"
            })
          ]),
          imageField(state, catalog),
          field("\u6570\u636E\u76D8\u6269\u5BB9\uFF1A\u989D\u5916\u589E\u52A0\u7684\u5BB9\u91CF\uFF08GB\uFF09", [
            numberInput(draft.expandGb, { min: "0", step: "1" }, (expandGb) => app.updateDraft({ expandGb })),
            h("div", { class: "hint warn", text: EXPAND_MEANING }),
            h("div", { class: "hint", text: EXPAND_RULES }),
            h("div", { class: "hint", text: EXPAND_FEE_NOTE })
          ]),
          field(`\u76D1\u6D4B\u95F4\u9694\uFF08\u79D2\uFF0C${MIN_INTERVAL_SEC}\uFF5E${MAX_INTERVAL_SEC}\uFF09`, [
            numberInput(
              draft.intervalSec,
              { min: String(MIN_INTERVAL_SEC), max: String(MAX_INTERVAL_SEC), step: "1" },
              (intervalSec) => app.updateDraft({ intervalSec })
            )
          ])
        );
      }
      children.push(
        h("div", { class: "field" }, [
          h("button", {
            class: "small",
            text: "\u5237\u65B0\u5217\u8868",
            attrs: { type: "button" },
            on: { click: () => void app.reloadCatalog() }
          })
        ])
      );
      form.replaceChildren(...children);
    };
    const renderStatus = (state) => {
      const { runner } = state;
      const active = isActive(runner.phase);
      const locked = active || state.busy;
      form.disabled = locked;
      startButton.disabled = locked;
      pauseButton.disabled = runner.phase !== "monitoring" && runner.phase !== "paused";
      pauseButton.textContent = runner.phase === "paused" ? "\u7EE7\u7EED" : "\u6682\u505C";
      stopButton.disabled = !active;
      errors.replaceChildren(
        ...state.errors.length === 0 ? [] : [
          h(
            "div",
            { class: "errors" },
            state.errors.map((message) => h("div", { text: message }))
          )
        ]
      );
      const children = [
        h("div", { class: "status" }, [
          h("div", {
            class: "phase",
            text: `\u72B6\u6001\uFF1A${PHASE_LABELS[runner.phase]}${runner.polls > 0 ? `\uFF08\u5DF2\u68C0\u67E5 ${runner.polls} \u6B21\uFF09` : ""}`
          }),
          ...runner.detail === "" ? [] : [h("div", { text: runner.detail })]
        ])
      ];
      if (runner.outcome !== null) {
        const { outcome } = runner;
        children.push(
          h("div", { class: outcome.mayBeBilling ? "outcome billing" : "outcome" }, [
            ...outcome.mayBeBilling ? [h("div", { class: "danger", text: "\u6CE8\u610F\uFF1A\u5B9E\u4F8B\u5DF2\u5B58\u5728\u6216\u53EF\u80FD\u5DF2\u5B58\u5728\uFF0C\u53EF\u80FD\u6B63\u5728\u8BA1\u8D39\u3002" })] : [],
            pairList(outcomePairs(outcome))
          ])
        );
      }
      if (state.pendingCreate && !active)
        children.push(
          h("div", { class: "errors" }, [
            h("div", {
              text: "\u4E0A\u4E00\u6B21\u4EFB\u52A1\u6709\u4E00\u4E2A\u521B\u5EFA\u8BF7\u6C42\u6CA1\u6709\u5F97\u5230\u786E\u8BA4\uFF08\u4F8B\u5982\u9875\u9762\u88AB\u5237\u65B0\uFF09\u3002\u8BF7\u5148\u5230 AutoDL \u63A7\u5236\u53F0\u7684\u5B9E\u4F8B\u5217\u8868\u6838\u5BF9\u662F\u5426\u591A\u4E86\u4E00\u53F0\u5B9E\u4F8B\uFF0C\u5B83\u53EF\u80FD\u6B63\u5728\u8BA1\u8D39\u3002"
            }),
            h("button", {
              class: "small",
              text: "\u6211\u5DF2\u6838\u5BF9\uFF0C\u6E05\u9664\u6838\u5BF9\u6807\u8BB0",
              on: { click: () => app.clearPendingCreate() }
            })
          ])
        );
      status.replaceChildren(...children);
    };
    const renderLog = () => {
      logBox.replaceChildren(
        ...log.entries().map(
          (entry) => h("div", { class: entry.level }, [
            h("span", {
              class: "time",
              text: new Date(entry.at).toLocaleTimeString("zh-CN", { hour12: false })
            }),
            entry.text
          ])
        )
      );
      logBox.scrollTop = logBox.scrollHeight;
    };
    const formShape = (state) => [state.catalogError, state.draft.imageKind, state.draft.regionIds.join()].join("|");
    app.subscribe((state, previous) => {
      if (state.catalog !== previous.catalog || formShape(state) !== formShape(previous)) renderForm(state);
      if (state.runner.phase !== previous.runner.phase && ["paused", "done", "failed"].includes(state.runner.phase))
        setCollapsed(false);
      renderStatus(state);
    });
    log.subscribe(renderLog);
    renderForm(app.getState());
    renderStatus(app.getState());
    renderLog();
    setCollapsed(startCollapsed);
    document.body.append(host);
  };

  // src/main.ts
  var HOST_ID = "autodl-grabber";
  var RENT_PATHS = ["/create", "/market"];
  var TASK_LOCK = "autodl-grabber:task";
  var PENDING_KEY = "autodl-grabber:pending-create";
  var notify = (title, body) => {
    if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body });
  };
  var requestNotifications = () => {
    if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
  };
  var mount = () => {
    const log = createLog();
    const tabLockSupported = "locks" in navigator;
    const lock = tabLockSupported ? createWebTabLock(navigator.locks, TASK_LOCK) : { acquire: async () => () => {
    } };
    const api = createAutodlApi({ fetch: window.fetch.bind(window), storage: window.localStorage });
    const pending = createStoredPending(window.localStorage, PENDING_KEY);
    const runner = createRunner({ api, pending, lock, log, notify });
    const app = createApp({
      api,
      runner,
      pending,
      log,
      storage: window.localStorage,
      tabLockSupported,
      requestNotifications
    });
    mountPanel(app, log, HOST_ID, !RENT_PATHS.some((prefix) => window.location.pathname.startsWith(prefix)));
    log.add("info", "\u811A\u672C\u5DF2\u52A0\u8F7D\u3002\u5237\u65B0\u9875\u9762\u540E\u914D\u7F6E\u4F1A\u4FDD\u7559\uFF0C\u4F46\u4E0D\u4F1A\u81EA\u52A8\u6062\u590D\u4EFB\u52A1\u3002");
    if (pending.load() !== null) log.add("warn", "\u68C0\u6D4B\u5230\u4E0A\u4E00\u6B21\u4EFB\u52A1\u6709\u672A\u786E\u8BA4\u7684\u521B\u5EFA\u8BF7\u6C42\uFF0C\u8BF7\u5148\u5230\u63A7\u5236\u53F0\u6838\u5BF9\u5B9E\u4F8B\u5217\u8868");
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && isActive(app.getState().runner.phase))
        log.add(
          "warn",
          "\u672C\u6807\u7B7E\u9875\u5DF2\u8F6C\u5165\u540E\u53F0\uFF0C\u6D4F\u89C8\u5668\u53EF\u80FD\u5927\u5E45\u5EF6\u8FDF\u6216\u6682\u505C\u76D1\u6D4B\u3002\u8BF7\u8BA9\u672C\u9875\u4FDD\u6301\u5728\u524D\u53F0\u53EF\u89C1\uFF08\u5EFA\u8BAE\u5355\u72EC\u5F00\u4E00\u4E2A\u7A97\u53E3\uFF09"
        );
    });
    void app.reloadCatalog();
  };
  if (document.getElementById(HOST_ID) === null) mount();
})();
