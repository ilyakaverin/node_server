import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { X509Certificate } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { rootDir } from "../utils/paths.js";
import { loadCertificates } from "../utils/scraper.js";

const certsDir = path.join(rootDir, "certs");

// SHA-256 отпечатки (DER), сверенные с независимыми источниками при добавлении
// файлов (см. certs/README.md). Новый файл в certs/ нужно сверить и добавить сюда.
const PINNED = {
  "russian_trusted_root_ca.pem":
    "D2:6D:2D:02:31:B7:C3:9F:92:CC:73:85:12:BA:54:10:35:19:E4:40:5D:68:B5:BD:70:3E:97:88:CA:8E:CF:31",
  "russian_trusted_sub_ca.pem":
    "BB:BD:E2:10:3E:79:0B:99:9E:C6:2B:D0:3C:F6:25:A5:A2:E7:C3:16:E1:0A:FE:6A:49:0E:ED:EA:D8:B3:FD:9B",
  "russian_trusted_sub_ca_2024.pem":
    "21:55:78:50:36:C9:00:DB:B5:F1:BB:2A:15:69:C8:0C:55:59:5B:D6:BF:94:86:7A:29:BB:DD:BC:7D:88:A3:F2",
};

const ROOT_FILE = "russian_trusted_root_ca.pem";
const MINTSIFRY = "O=The Ministry of Digital Development and Communications";

const certFiles = fs.readdirSync(certsDir).filter((name) => /\.(pem|crt)$/i.test(name));
const load = (name) => new X509Certificate(fs.readFileSync(path.join(certsDir, name)));

describe("сертификаты НУЦ Минцифры в certs/", () => {
  test("в каталоге только сверенные файлы, по одному сертификату в каждом", () => {
    assert.deepEqual(certFiles.sort(), Object.keys(PINNED).sort());
    for (const name of certFiles) {
      const pem = fs.readFileSync(path.join(certsDir, name), "utf-8");
      assert.equal(pem.match(/BEGIN CERTIFICATE/g)?.length, 1, name);
    }
  });

  for (const [name, fingerprint] of Object.entries(PINNED)) {
    test(`${name}: отпечаток совпадает со сверенным`, () => {
      assert.equal(load(name).fingerprint256, fingerprint);
    });
  }

  test("корневой сертификат самоподписан и является CA", () => {
    const root = load(ROOT_FILE);

    assert.ok(root.subject.includes("CN=Russian Trusted Root CA"));
    assert.ok(root.subject.includes(MINTSIFRY));
    assert.ok(root.ca);
    assert.ok(root.checkIssued(root));
    assert.ok(root.verify(root.publicKey));
  });

  test("промежуточные сертификаты подписаны корневым", () => {
    const root = load(ROOT_FILE);

    for (const name of certFiles.filter((file) => file !== ROOT_FILE)) {
      const sub = load(name);
      assert.ok(sub.ca, name);
      assert.ok(sub.subject.includes(MINTSIFRY), name);
      assert.ok(sub.checkIssued(root), name);
      assert.ok(sub.verify(root.publicKey), name);
    }
  });

  test("корневой и хотя бы один промежуточный сертификат действуют", () => {
    const now = Date.now();
    const isValid = (cert) => Date.parse(cert.validFrom) <= now && now <= Date.parse(cert.validTo);

    assert.ok(isValid(load(ROOT_FILE)), "корневой сертификат просрочен — обновите certs/");
    assert.ok(
      certFiles.filter((name) => name !== ROOT_FILE).some((name) => isValid(load(name))),
      "все промежуточные сертификаты просрочены — возьмите актуальные на gosuslugi.ru/crt",
    );
  });

  test("парсер загружает все сертификаты из certs/", () => {
    assert.equal(loadCertificates(certsDir).length, certFiles.length);
  });
});
