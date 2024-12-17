#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PdfFormExtractorStack } from '../lib/pdf-form-extractor-stack';

const app = new cdk.App();
new PdfFormExtractorStack(app, 'PdfFormExtractorStack', {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION 
  },
});