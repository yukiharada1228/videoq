import { Config } from '@remotion/cli/config';
import { webpackOverride } from './webpack-override.mjs';

Config.overrideWebpackConfig(webpackOverride);
