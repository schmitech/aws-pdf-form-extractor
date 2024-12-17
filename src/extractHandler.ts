import { S3Event } from 'aws-lambda';
import { 
  TextractClient, 
  AnalyzeDocumentCommand,
  FeatureType,
  Document
} from '@aws-sdk/client-textract';
import { 
  S3Client, 
  GetObjectCommand,
  PutObjectCommand 
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';

const s3Client = new S3Client({});
const textractClient = new TextractClient({});

interface FormField {
  key: string;
  value: string;
  confidence: number;
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('error', (err) => reject(err));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

async function extractFormFields(document: Document): Promise<FormField[]> {
  const command = new AnalyzeDocumentCommand({
    Document: document,
    FeatureTypes: [FeatureType.FORMS]
  });

  try {
    const response = await textractClient.send(command);
    const fields: FormField[] = [];

    response.Blocks?.forEach(block => {
      if (block.BlockType === 'KEY_VALUE_SET' && block.EntityTypes?.includes('KEY')) {
        const keyText = block.Relationships?.find(r => r.Type === 'CHILD')?.Ids
          ?.map(id => response.Blocks?.find(b => b.Id === id)?.Text)
          .join(' ');

        const valueBlock = response.Blocks?.find(b => 
          block.Relationships?.find(r => r.Type === 'VALUE')?.Ids?.includes(b.Id ?? '')
        );

        const valueText = valueBlock?.Relationships?.find(r => r.Type === 'CHILD')?.Ids
          ?.map(id => response.Blocks?.find(b => b.Id === id)?.Text)
          .join(' ');

        if (keyText && valueText) {
          fields.push({
            key: keyText,
            value: valueText,
            confidence: block.Confidence ?? 0
          });
        }
      }
    });

    return fields;
  } catch (error) {
    console.error('Error analyzing document:', error);
    throw error;
  }
}

export const handler = async (event: S3Event) => {
  try {
    for (const record of event.Records) {
      const bucket = record.s3.bucket.name;
      const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

      // Get PDF from S3
      const getCommand = new GetObjectCommand({
        Bucket: bucket,
        Key: key
      });

      const response = await s3Client.send(getCommand);
      const documentBuffer = await streamToBuffer(response.Body as Readable);

      // Extract form fields
      const fields = await extractFormFields({
        Bytes: documentBuffer
      });

      // Save results
      const outputKey = `${key.replace('.pdf', '')}-results.json`;
      const putCommand = new PutObjectCommand({
        Bucket: bucket,
        Key: outputKey,
        Body: JSON.stringify(fields, null, 2),
        ContentType: 'application/json'
      });

      await s3Client.send(putCommand);

      console.log(`Successfully processed ${key} and saved results to ${outputKey}`);
    }
  } catch (error) {
    console.error('Error processing PDF:', error);
    throw error;
  }
};