#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { FileShareSystemStack } from '../lib/file-share-system-stack';

const app = new cdk.App();
new FileShareSystemStack(app, 'FileShareSystemStack', {
  /* If you don't specify 'env', this stack will be environment-agnostic.
   * Account/Region-dependent features and context lookups will not work,
   * but a single synthesized template can be deployed anywhere. */

  /* Uncomment the next line to specialize this stack for the AWS Account
   * and Region that are implied by the current CLI configuration. */
  /* If you need a specific environment, uncomment and modify this block
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT || '123456789012', 
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1' 
  },
  */

  /* Uncomment the next line if you know exactly what Account and Region you
   * want to deploy the stack to. */
  // env: { account: '123456789012', region: 'us-east-1' },

  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
});
