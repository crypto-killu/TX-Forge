#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

// ──────────────────────────────────────────────────────────────────────────
//  ЦВЕТА (чистый ANSI, без зависимостей — нужны ещё ДО установки пакетов)
// ──────────────────────────────────────────────────────────────────────────

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const RED = "\x1b[91m";

// Радужная палитра для баннера — по цвету на букву
const RAINBOW = [
  "\x1b[91m", // красный
  "\x1b[93m", // жёлтый
  "\x1b[92m", // зелёный
  "\x1b[96m", // голубой
  "\x1b[94m", // синий
  "\x1b[95m", // фиолетовый
  "\x1b[91m", // красный (цикл)
];

function clearScreen() {
  process.stdout.write("\x1Bc");
}

function r(text) {
  // Обёртка для "остального текста" интерфейса — весь красный
  return `${RED}${text}${RESET}`;
}

function printRed(text) {
  console.log(r(text));
}

// ──────────────────────────────────────────────────────────────────────────
//  РАДУЖНЫЙ БАННЕР "TXFORGE"
// ──────────────────────────────────────────────────────────────────────────

const BANNER_ROWS = [
  "█████  █   █  █████   ███   ████    ███   █████  ",
  "  █     █ █   █      █   █  █   █  █      █      ",
  "  █      █    ████   █   █  ████   █  ██  ████   ",
  "  █     █ █   █      █   █  █  █   █   █  █      ",
  "  █    █   █  █      █   █  █   █  █   █  █      ",
  "  █    █   █  █       ███   █   █   ███   █████  ",
];

// Ширина одной буквы в колонках баннера (5 символов глифа + 2 пробела)
const LETTER_WIDTH = 7;

function printRainbowBanner() {
  for (const row of BANNER_ROWS) {
    let line = "";
    for (let i = 0; i < row.length; i++) {
      const letterIndex = Math.floor(i / LETTER_WIDTH);
      const color = RAINBOW[letterIndex % RAINBOW.length];
      line += color + row[i];
    }
    console.log(line + RESET);
  }
  console.log(r(`${BOLD}  генератор TON платёжных ссылок (TON / USDT / NFT)${RESET}`));
  console.log("");
}

// ──────────────────────────────────────────────────────────────────────────
//  САМОУСТАНОВКА ЗАВИСИМОСТЕЙ С АНИМАЦИЕЙ
// ──────────────────────────────────────────────────────────────────────────

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function dependenciesInstalled() {
  try {
    require.resolve("@ton/core", { paths: [__dirname] });
    return true;
  } catch {
    return false;
  }
}

function runInstallWithAnimation() {
  return new Promise((resolve, reject) => {
    let frame = 0;
    let colorIdx = 0;
    clearScreen();
    printRainbowBanner();
    console.log(r(`${BOLD}Первый запуск — устанавливаю зависимости...${RESET}`));
    console.log("");

    const spinnerInterval = setInterval(() => {
      const color = RAINBOW[colorIdx % RAINBOW.length];
      const spinnerFrame = SPINNER_FRAMES[frame % SPINNER_FRAMES.length];
      process.stdout.write(`\r${color}${spinnerFrame}${RESET} ${r("npm install @ton/core...")}  `);
      frame++;
      colorIdx++;
    }, 90);

    const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
    const child = spawn(npmCmd, ["install"], { cwd: __dirname, stdio: "ignore" });

    child.on("error", (err) => {
      clearInterval(spinnerInterval);
      reject(err);
    });

    child.on("exit", (code) => {
      clearInterval(spinnerInterval);
      process.stdout.write("\r" + " ".repeat(60) + "\r");
      if (code === 0) {
        console.log(r(`✅ Зависимости установлены!`));
        console.log("");
        setTimeout(resolve, 600);
      } else {
        reject(new Error(`npm install завершился с кодом ${code}`));
      }
    });
  });
}

async function ensureDependencies() {
  if (dependenciesInstalled()) return;

  const packageJsonPath = path.join(__dirname, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    console.log(r("❌ Не найден package.json рядом с index.js — установка невозможна."));
    process.exit(1);
  }

  try {
    await runInstallWithAnimation();
  } catch (e) {
    console.log(r(`❌ Не удалось установить зависимости: ${e.message}`));
    console.log(r("Попробуй выполнить вручную: npm install"));
    process.exit(1);
  }
}

// ──────────────────────────────────────────────────────────────────────────
//  КОНСТАНТЫ TON
// ──────────────────────────────────────────────────────────────────────────

const USDT_JETTON_MASTER = "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs";
const USDT_DECIMALS = 6;

const NFT_FORWARD_AMOUNT_TON = "0.01";
const NFT_ATTACHED_AMOUNT_TON = "0.05";

// ──────────────────────────────────────────────────────────────────────────
//  ОСНОВНАЯ ЛОГИКА (модули из @ton/core требуются только ПОСЛЕ установки)
// ──────────────────────────────────────────────────────────────────────────

let beginCell, Address, toNano;

const readline = require("readline");
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (question) => new Promise((resolve) => rl.question(r(question), resolve));

function toRawUnits(amountStr, decimals) {
  const value = parseFloat(amountStr.replace(",", "."));
  if (isNaN(value) || value <= 0) return null;
  return BigInt(Math.round(value * 10 ** decimals)).toString();
}

function isValidTonAddress(address) {
  try {
    Address.parse(address);
    return true;
  } catch {
    return false;
  }
}

function buildTonTransferLink(address, amountTon) {
  const nano = toNano(amountTon.replace(",", ".")).toString();
  return `ton://transfer/${address}?amount=${nano}`;
}

function buildJettonTransferLink(address, jettonMaster, amountStr, decimals) {
  const raw = toRawUnits(amountStr, decimals);
  if (raw === null) return null;
  return `ton://transfer/${address}?jetton=${jettonMaster}&amount=${raw}`;
}

function buildNftTransferLink(nftAddress, newOwnerAddress) {
  const body = beginCell()
    .storeUint(0x5fcc3d14, 32)
    .storeUint(0, 64)
    .storeAddress(Address.parse(newOwnerAddress))
    .storeAddress(Address.parse(newOwnerAddress))
    .storeUint(0, 1)
    .storeCoins(toNano(NFT_FORWARD_AMOUNT_TON))
    .storeUint(0, 1)
    .endCell();

  const bin = encodeURIComponent(body.toBoc().toString("base64"));
  const amountNano = toNano(NFT_ATTACHED_AMOUNT_TON).toString();

  return `https://app.tonkeeper.com/transfer/${nftAddress}?amount=${amountNano}&bin=${bin}`;
}

function showScreen(...lines) {
  clearScreen();
  printRainbowBanner();
  for (const line of lines) printRed(line);
}

async function assetMenu(recipientAddress) {
  showScreen(
    `Получатель: ${recipientAddress}`,
    "",
    "Что получаем на этот адрес?",
    "  1. GRAM (TON)",
    "  2. USDT",
    "  3. NFT актив"
  );

  const choice = (await ask("> ")).trim();
  let link = null;

  if (choice === "1") {
    const amount = (await ask("Сумма TON (например 0.5): ")).trim();
    link = buildTonTransferLink(recipientAddress, amount);
  } else if (choice === "2") {
    const amount = (await ask("Сумма USDT (например 10): ")).trim();
    link = buildJettonTransferLink(recipientAddress, USDT_JETTON_MASTER, amount, USDT_DECIMALS);
  } else if (choice === "3") {
    const nftAddress = (await ask("Адрес NFT-актива (контракт конкретного подарка): ")).trim();
    if (!isValidTonAddress(nftAddress)) {
      printRed("❌ Некорректный адрес NFT-контракта.");
      await ask("Нажми Enter, чтобы продолжить...");
      return assetMenu(recipientAddress);
    }
    link = buildNftTransferLink(nftAddress, recipientAddress);
  } else {
    printRed("❌ Неизвестный вариант.");
    await ask("Нажми Enter, чтобы продолжить...");
    return assetMenu(recipientAddress);
  }

  if (link === null) {
    printRed("❌ Некорректная сумма.");
    await ask("Нажми Enter, чтобы продолжить...");
    return assetMenu(recipientAddress);
  }

  showScreen(`Получатель: ${recipientAddress}`, "", "✅ Ссылка готова:", "", link, "");

  const next = (await ask("1. Создать ещё одну ссылку (тот же адрес)\n2. В главное меню\n> ")).trim();
  if (next === "1") {
    await assetMenu(recipientAddress);
  } else {
    await mainMenu();
  }
}

async function createLinkFlow() {
  showScreen("Введите TON-адрес для получения средств:");
  const address = (await ask("> ")).trim();
  if (!isValidTonAddress(address)) {
    printRed("❌ Это не похоже на валидный TON-адрес.");
    await ask("Нажми Enter, чтобы продолжить...");
    return createLinkFlow();
  }
  await assetMenu(address);
}

async function mainMenu() {
  showScreen("1. Создать платёжную ссылку", "0. Выход");

  const choice = (await ask("> ")).trim();

  if (choice === "1") {
    await createLinkFlow();
  } else if (choice === "0") {
    clearScreen();
    rl.close();
    process.exit(0);
  } else {
    printRed("❌ Неизвестный вариант.");
    await mainMenu();
  }
}

// ──────────────────────────────────────────────────────────────────────────
//  BOOTSTRAP
// ──────────────────────────────────────────────────────────────────────────

(async () => {
  await ensureDependencies();

  // Требуем @ton/core только когда установка гарантированно завершена
  ({ beginCell, Address, toNano } = require("@ton/core"));

  await mainMenu();
})();
