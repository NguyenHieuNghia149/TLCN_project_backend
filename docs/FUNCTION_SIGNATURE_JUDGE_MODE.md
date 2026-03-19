# Function Signature Judge Mode Summary

## Muc tieu

Tai lieu nay tong hop nhung thay doi da duoc them de ho tro kieu cham bai giong LeetCode ben canh kieu cham truyen thong `stdin_stdout`.

He thong hien tai ho tro 2 mode:

- `stdin_stdout`: nguoi dung tu viet `main()` va tu doc `stdin`
- `function_signature`: nguoi dung chi can viet logic cho ham bai toan, server se tu sinh wrapper, parse testcase, goi ham, va serialize output

## Function Signature la gi?

`function_signature` la metadata mo ta chinh xac ham ma nguoi dung phai hoan thanh.

Vi du voi bai `Two Sum`:

```json
{
  "methodName": "twoSum",
  "parameters": [
    {
      "name": "nums",
      "type": { "kind": "array", "element": "int" }
    },
    {
      "name": "target",
      "type": { "kind": "scalar", "name": "int" }
    }
  ],
  "returnType": { "kind": "array", "element": "int" }
}
```

Y nghia cua metadata nay:

- Ten ham can goi la `twoSum`
- Ham nhan 2 tham so:
  - `nums: array<int>`
  - `target: int`
- Ham tra ve `array<int>`

Tu metadata nay, server co the:

- sinh starter code cho `cpp`, `java`, `python`
- validate testcase co dung kieu du lieu hay khong
- sinh wrapper/harness an de goi dung ham cua user
- so sanh ket qua theo dang canonical JSON

## Vi sao can `inputJson` thay vi chi `input` text?

Voi `stdin_stdout`, `input` text la du vi chuong trinh cua user tu doc `stdin`.

Voi `function_signature`, server phai hieu ro du lieu de map vao tung tham so cua ham. Vi vay can `inputJson` va `outputJson` lam source of truth.

Vi du:

```json
{
  "nums": [2, 7, 11, 15],
  "target": 9
}
```

Neu chi co text nhu `2 7 11 15 9` thi server khong biet chac:

- day la 1 mang va 1 scalar
- hay 5 tham so rieng
- hay co them do dai mang
- hay co nested array, bool, string, matrix

Dung `inputJson` giup:

- giu duoc type that cua testcase
- map dung theo ten tham so
- validate testcase theo `function_signature`
- sinh wrapper da ngon ngu mot cach an toan va nhat quan
- khong bat nguoi dung tu parse JSON hay tu viet `main()`

Luu y:

- `function_signature`: `inputJson` / `outputJson` la canonical data
- `input` / `output` text van duoc giu lai de hien thi, debug, va giu tuong thich response
- `stdin_stdout`: van tiep tuc dung `input` / `output` text nhu cu

## Nhung thay doi da thuc hien

### 1. Shared types

Da them cac type moi:

- `packages/shared/types/problemJudgeMode.enum.ts`
- `packages/shared/types/functionSignature.ts`
- cap nhat export trong `packages/shared/types/index.ts`

Noi dung chinh:

- enum `EProblemJudgeMode`
- `FunctionSignature`
- `FunctionParameter`
- mo ta type scalar / array / matrix
- starter-code types cho `cpp`, `java`, `python`

### 2. Schema database

Da cap nhat schema:

- `packages/shared/db/schema/problem.ts`
- `packages/shared/db/schema/testcase.ts`

Them cac cot moi:

- `problems.judge_mode`
- `problems.function_signature`
- `testcases.input_json`
- `testcases.output_json`

### 3. Validation layer

Da cap nhat:

- `packages/shared/validations/problem.validation.ts`
- `packages/shared/validations/testcase.validation.ts`

Chuc nang moi:

- validate `judgeMode`
- validate `functionSignature`
- validate testcase JSON dung theo signature
- phan biet ro 2 mode:
  - `stdin_stdout`
  - `function_signature`

### 4. Shared helper cho function mode

Da them:

- `packages/shared/utils/function-signature.ts`
- export tai `packages/shared/utils/index.ts`

Helper nay phu trach:

- validate structured testcase input/output
- canonicalize JSON output
- sinh starter code cho `cpp`, `java`, `python`
- sinh hidden wrapper/harness cho worker runtime

### 5. Repository va API service

Da cap nhat:

- `apps/api/src/repositories/problem.repository.ts`
- `apps/api/src/repositories/testcase.repository.ts`
- `apps/api/src/services/challenge.service.ts`
- `apps/api/src/services/submission.service.ts`
- `apps/api/src/services/queue.service.ts`
- `apps/api/src/services/favorite.service.ts`

Thay doi chinh:

- problem create/update co the luu `judgeMode` va `functionSignature`
- testcase create/update co the luu `inputJson` / `outputJson`
- challenge detail tra ve:
  - `judgeMode`
  - `functionSignature`
  - `starterCodeByLanguage`
  - `inputJson` / `outputJson`
- submission flow dua them metadata function mode vao queue job
- favorite/problem response khong bi mat thong tin mode moi

## 6. Worker va queue pipeline

Da cap nhat:

- `apps/api/src/services/queue.service.ts`
- `apps/worker/src/worker.service.ts`

Flow moi cho `function_signature`:

1. API tao queue job co:
   - `judgeMode`
   - `functionSignature`
   - `inputJson` / `outputJson`
   - display `input` / `output`
2. Worker nhan job
3. Worker sinh full source tam tu:
   - source code cua user
   - hidden wrapper theo ngon ngu
   - testcase metadata
4. Worker gui full source da sinh vao sandbox
5. Sandbox chi viec compile va run nhu binh thuong
6. Worker remap ket qua ve dang hien thi cho API / SSE / DB

## 7. Sandbox va runtime

Da cap nhat:

- `config/sandbox.yaml`
- `apps/sandbox/src/sandbox.service.ts`

Thay doi quan trong:

- Python runtime dung `python3` thay vi `python`
- Java runtime duoc them JVM flags de giam memory footprint trong `nsjail`
- Sandbox service duoc them Java-specific address-space floor de JVM co the khoi dong on dinh

## 8. Migration va du lieu

Da them migration:

- `packages/shared/db/migrations/20260319074403_lovely_giant_man.sql`

Migration nay:

- them cot moi cho `problems` va `testcases`
- migrate bai `Two Sum` sang `function_signature`
- chuyen testcase `Two Sum` sang `input_json` / `output_json`

## 9. Bai Two Sum da duoc migrate

Problem ID:

- `0f465ec8-b3a7-402e-8d5a-a7e99a2f37cb`

Trang thai moi:

- `judgeMode = function_signature`
- `methodName = twoSum`
- starter code tra ve theo tung ngon ngu

Vi du starter code C++ hien tai:

```cpp
#include <vector>
#include <string>
using namespace std;

class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        
        return {};
    }
};
```

Nguoi dung khong can tu viet `main()` nua.

## 10. Fixture va test

Da cap nhat:

- `tests/performance/submission_load_test.yml`

Load test hien tai dung snippet LeetCode-style thay vi full `main()`.

## Verify da thuc hien

Da verify thanh cong:

- `npm run build`
- `npm run db:migrate`
- `npm run db:check`
- challenge detail tra ve dung `judgeMode`, `functionSignature`, `starterCodeByLanguage`
- submit end-to-end thanh cong cho bai `Two Sum` voi:
  - C++: `accepted`, `100`, `5/5`
  - Java: `accepted`, `100`, `5/5`
  - Python: `accepted`, `100`, `5/5`

## So sanh nhanh 2 mode

### `stdin_stdout`

Dung khi:

- bai theo kieu OJ truyen thong
- user tu viet full program
- user tu doc `stdin` va in `stdout`

Storage chinh:

- `input`
- `output`

### `function_signature`

Dung khi:

- bai theo kieu LeetCode
- user chi can viet logic cho ham
- server tu lo wrapper, testcase parsing, va output serialization

Storage chinh:

- `inputJson`
- `outputJson`

Display / backward compatibility:

- van giu `input`
- van giu `output`

## Tinh toi uu hien tai

Huong toi uu da duoc chon la:

- giu ca 2 mode song song
- `function_signature` dung `inputJson` / `outputJson` lam source of truth
- van giu `input` / `output` text de hien thi va giu tuong thich API hien tai

Dieu nay giup:

- khong pha bai cu theo `stdin_stdout`
- rollout an toan hon
- de debug hon
- khong can sua toan bo response/UI trong 1 lan

## Huong toi uu tiep theo

Neu muon toi uu them sau nay, co the lam tiep:

1. Tach ro canonical data va display data trong testcase response
2. Voi `function_signature`, can nhac khong luu `input` / `output` text nua, ma generate display string luc doc
3. Mo rong type support them:
   - `ListNode`
   - `TreeNode`
   - object custom
4. Them E2E test rieng cho tung ngon ngu trong function mode
5. Tach sandbox test route mounted trong API khoi runtime path de tranh nham voi sandbox container that

## Ket luan

`function_signature` giup he thong ho tro trai nghiem submit bai giong LeetCode:

- user chi can viet logic
- server lo wrapper va testcase binding
- worker lo execution source generation
- sandbox van giu vai tro generic compile/run engine

Ket qua la kien truc hien tai da ho tro duoc ca:

- bai OJ truyen thong (`stdin_stdout`)
- bai LeetCode-style (`function_signature`)

ma khong can bo kieu cham cu.
