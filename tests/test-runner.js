#!/usr/bin/env node

/**
 * SQLフォーマッター テストランナー
 * 
 * 使用法:
 *   node tests/test-runner.js                 # 全テスト実行
 *   node tests/test-runner.js --unit          # ユニットテストのみ
 *   node tests/test-runner.js --integration   # 統合テストのみ
 *   node tests/test-runner.js --verbose       # 詳細出力
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// コマンドライン引数の解析
const args = process.argv.slice(2);
const isUnitOnly = args.includes('--unit');
const isIntegrationOnly = args.includes('--integration');
const isVerbose = args.includes('--verbose');
const isWatch = args.includes('--watch');

// テストファイルのパス
const testPaths = [];

if (isUnitOnly) {
    testPaths.push('tests/unit/**/*.test.js');
} else if (isIntegrationOnly) {
    testPaths.push('tests/integration/**/*.test.js');
} else {
    testPaths.push('tests/unit/**/*.test.js');
    testPaths.push('tests/integration/**/*.test.js');
}

// Mochaの設定
const mochaArgs = [
    '--recursive',
    '--timeout', '5000',
    '--reporter', isVerbose ? 'spec' : 'progress'
];

if (isWatch) {
    mochaArgs.push('--watch');
}

// テストパスを追加
mochaArgs.push(...testPaths);

console.log('🧪 SQLフォーマッター テストスイート');
console.log('=====================================');
console.log(`実行モード: ${isUnitOnly ? 'ユニットテストのみ' : isIntegrationOnly ? '統合テストのみ' : '全テスト'}`);
console.log(`詳細表示: ${isVerbose ? 'ON' : 'OFF'}`);
console.log(`ウォッチモード: ${isWatch ? 'ON' : 'OFF'}`);
console.log('');

// Mochaを実行
const mocha = spawn('npx', ['mocha', ...mochaArgs], {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
});

mocha.on('close', (code) => {
    console.log('');
    if (code === 0) {
        console.log('✅ 全テストが成功しました！');
    } else {
        console.log('❌ テストが失敗しました。');
        process.exit(code);
    }
});

mocha.on('error', (error) => {
    console.error('❌ テスト実行エラー:', error.message);
    console.error('');
    console.error('💡 ヒント:');
    console.error('  - npm install が実行されているか確認してください');
    console.error('  - Mochaがインストールされているか確認してください: npm install -g mocha');
    process.exit(1);
});