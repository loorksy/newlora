import js from '@eslint/js';
import ts from 'typescript-eslint';
export default ts.config({ignores:['**/node_modules/**','**/dist/**','**/android/**','**/ios/**']},js.configs.recommended,...ts.configs.recommended,{files:['**/*.{ts,tsx}'],rules:{'@typescript-eslint/no-explicit-any':'off','@typescript-eslint/no-unused-vars':['error',{argsIgnorePattern:'^_',varsIgnorePattern:'^_'}],'no-undef':'off'}});
