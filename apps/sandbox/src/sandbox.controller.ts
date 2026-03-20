import { NextFunction, Request, Response } from 'express';
import { ExecutionConfig } from '@backend/shared/validations';
import { ISandboxService } from './sandbox.service';

export class SandboxController {
  constructor(private readonly sandboxService: ISandboxService) {}

  async executeCode(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const config: ExecutionConfig = req.body;

      if (!config.code || !config.language || !config.testcases) {
        res.status(400).json({
          success: false,
          message: 'Missing required fields: code, language, testcases',
        });
        return;
      }

      const result = await this.sandboxService.executeCode(config);

      if (result.success) {
        res.status(200).json({
          success: true,
          data: result.result,
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.error,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      next(error);
    }
  }

  async getStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const status = this.sandboxService.getStatus();

      res.status(200).json({
        success: true,
        data: status,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }

  async healthCheck(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const isHealthy = await this.sandboxService.healthCheck();

      res.status(isHealthy ? 200 : 503).json({
        success: isHealthy,
        data: {
          status: isHealthy ? 'healthy' : 'unhealthy',
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async testSandbox(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { language } = req.query;

      if (!language) {
        res.status(400).json({
          success: false,
          message: 'Language parameter is required',
        });
        return;
      }

      const sampleConfigs = {
        cpp: {
          code: `#include <iostream>
using namespace std;
int main() {
    int a, b;
    cin >> a >> b;
    cout << a + b << endl;
    return 0;
}`,
          language: 'cpp',
          testcases: [
            { id: '1', input: '5 3', output: '8', point: 10 },
            { id: '2', input: '10 20', output: '30', point: 10 },
          ],
          timeLimit: 1000,
          memoryLimit: '128m',
        },
        python: {
          code: `a, b = map(int, input().split())
print(a + b)`,
          language: 'python',
          testcases: [
            { id: '1', input: '5 3', output: '8', point: 10 },
            { id: '2', input: '10 20', output: '30', point: 10 },
          ],
          timeLimit: 2000,
          memoryLimit: '256m',
        },
        java: {
          code: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int a = sc.nextInt();
        int b = sc.nextInt();
        System.out.println(a + b);
    }
}`,
          language: 'java',
          testcases: [
            { id: '1', input: '5 3', output: '8', point: 10 },
            { id: '2', input: '10 20', output: '30', point: 10 },
          ],
          timeLimit: 2000,
          memoryLimit: '256m',
        },
        javascript: {
          code: `const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.on('line', (line) => {
    const [a, b] = line.split(' ').map(Number);
    console.log(a + b);
    rl.close();
});`,
          language: 'javascript',
          testcases: [
            { id: '1', input: '5 3', output: '8', point: 10 },
            { id: '2', input: '10 20', output: '30', point: 10 },
          ],
          timeLimit: 2000,
          memoryLimit: '256m',
        },
      };

      const config = sampleConfigs[language as keyof typeof sampleConfigs];
      if (!config) {
        res.status(400).json({
          success: false,
          message: 'Unsupported language for testing',
        });
        return;
      }

      const result = await this.sandboxService.executeCode(config as ExecutionConfig);

      res.status(200).json({
        success: true,
        data: {
          testConfig: config,
          result: result.result,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
