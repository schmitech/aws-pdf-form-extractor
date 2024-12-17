import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Duration } from 'aws-cdk-lib';
import * as path from 'path';

export class PdfFormExtractorStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create S3 bucket for PDF storage
    const storageBucket = new s3.Bucket(this, 'PdfStorageBucket', {
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For PoC only
      autoDeleteObjects: true, // For PoC only
      lifecycleRules: [
        {
          expiration: Duration.days(7) // For PoC only
        }
      ]
    });

    // Create Lambda function for processing PDFs
    const extractorFunction = new NodejsFunction(this, 'PdfExtractorFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'handler',
      entry: path.join(__dirname, '../src/extractHandler.ts'),
      timeout: Duration.minutes(5),
      memorySize: 1024,
      environment: {
        BUCKET_NAME: storageBucket.bucketName
      }
    });

    // Grant Textract permissions to Lambda
    extractorFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'textract:AnalyzeDocument',
        'textract:GetDocumentAnalysis',
        'textract:StartDocumentAnalysis'
      ],
      resources: ['*']
    }));

    // Grant S3 permissions to Lambda
    storageBucket.grantReadWrite(extractorFunction);

    // Add S3 trigger for PDF uploads
    storageBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(extractorFunction),
      { suffix: '.pdf' }
    );

    // Output the bucket name
    new cdk.CfnOutput(this, 'BucketName', {
      value: storageBucket.bucketName,
      description: 'Name of the S3 bucket for uploading PDFs'
    });
  }
}