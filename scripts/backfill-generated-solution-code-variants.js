require('dotenv').config();
const { Client } = require('pg');

const APPLY = process.argv.includes('--apply');
const key = (problemTitle, approachTitle) => `${problemTitle}::${approachTitle}`;

function cppSolution(body) {
  return [
    '#include <algorithm>',
    '#include <climits>',
    '#include <optional>',
    '#include <sstream>',
    '#include <stack>',
    '#include <string>',
    '#include <unordered_map>',
    '#include <unordered_set>',
    '#include <vector>',
    '',
    'using namespace std;',
    '',
    'class Solution {',
    'public:',
    ...body.trim().split('\n').map(line => `    ${line}`),
    '};',
  ].join('\n');
}

function javaSolution(body) {
  return [
    'import java.util.*;',
    '',
    'class Solution {',
    ...body.trim().split('\n').map(line => `    ${line}`),
    '}',
  ].join('\n');
}

function pythonSolution(body) {
  return [
    'from collections import defaultdict',
    'from typing import List, Optional',
    '',
    'class Solution:',
    ...body.trim().split('\n').map(line => (line ? `    ${line}` : '')),
  ].join('\n');
}

function variants(cpp, java, python) {
  return [
    { language: 'cpp', sourceCode: cpp.trim() },
    { language: 'java', sourceCode: java.trim() },
    { language: 'python', sourceCode: python.trim() },
  ];
}

const TEMPLATES = {};
Object.assign(TEMPLATES, {
  [key('Two Sum', 'Brute Force Approach')]: variants(
    cppSolution(`
vector<int> twoSum(const vector<int>& nums, int target) {
    for (int i = 0; i < static_cast<int>(nums.size()); ++i) {
        for (int j = i + 1; j < static_cast<int>(nums.size()); ++j) {
            if (nums[i] + nums[j] == target) {
                return {i, j};
            }
        }
    }
    return {};
}`),
    javaSolution(`
public int[] twoSum(int[] nums, int target) {
    for (int i = 0; i < nums.length; i++) {
        for (int j = i + 1; j < nums.length; j++) {
            if (nums[i] + nums[j] == target) {
                return new int[] { i, j };
            }
        }
    }
    return new int[0];
}`),
    pythonSolution(`
def twoSum(self, nums: List[int], target: int) -> List[int]:
    for i in range(len(nums)):
        for j in range(i + 1, len(nums)):
            if nums[i] + nums[j] == target:
                return [i, j]
    return []`),
  ),
  [key('Two Sum', 'Hash Map Approach')]: variants(
    cppSolution(`
vector<int> twoSum(const vector<int>& nums, int target) {
    unordered_map<int, int> seen;
    for (int i = 0; i < static_cast<int>(nums.size()); ++i) {
        int complement = target - nums[i];
        auto it = seen.find(complement);
        if (it != seen.end()) {
            return {it->second, i};
        }
        seen[nums[i]] = i;
    }
    return {};
}`),
    javaSolution(`
public int[] twoSum(int[] nums, int target) {
    Map<Integer, Integer> seen = new HashMap<>();
    for (int i = 0; i < nums.length; i++) {
        int complement = target - nums[i];
        if (seen.containsKey(complement)) {
            return new int[] { seen.get(complement), i };
        }
        seen.put(nums[i], i);
    }
    return new int[0];
}`),
    pythonSolution(`
def twoSum(self, nums: List[int], target: int) -> List[int]:
    seen = {}
    for index, value in enumerate(nums):
        complement = target - value
        if complement in seen:
            return [seen[complement], index]
        seen[value] = index
    return []`),
  ),
  [key('Longest Substring Without Repeating Characters', 'Sliding Window Approach')]: variants(
    cppSolution(`
int lengthOfLongestSubstring(const string& s) {
    vector<int> lastSeen(128, -1);
    int left = 0;
    int best = 0;
    for (int right = 0; right < static_cast<int>(s.size()); ++right) {
        left = max(left, lastSeen[s[right]] + 1);
        lastSeen[s[right]] = right;
        best = max(best, right - left + 1);
    }
    return best;
}`),
    javaSolution(`
public int lengthOfLongestSubstring(String s) {
    int[] lastSeen = new int[128];
    Arrays.fill(lastSeen, -1);
    int left = 0;
    int best = 0;
    for (int right = 0; right < s.length(); right++) {
        left = Math.max(left, lastSeen[s.charAt(right)] + 1);
        lastSeen[s.charAt(right)] = right;
        best = Math.max(best, right - left + 1);
    }
    return best;
}`),
    pythonSolution(`
def lengthOfLongestSubstring(self, s: str) -> int:
    last_seen = {}
    left = 0
    best = 0
    for right, char in enumerate(s):
        if char in last_seen:
            left = max(left, last_seen[char] + 1)
        last_seen[char] = right
        best = max(best, right - left + 1)
    return best`),
  ),
  [key('Longest Substring Without Repeating Characters', 'Sliding Window with Hash Set')]: variants(
    cppSolution(`
int lengthOfLongestSubstring(const string& s) {
    unordered_set<char> window;
    int left = 0;
    int best = 0;
    for (int right = 0; right < static_cast<int>(s.size()); ++right) {
        while (window.count(s[right]) > 0) {
            window.erase(s[left]);
            ++left;
        }
        window.insert(s[right]);
        best = max(best, right - left + 1);
    }
    return best;
}`),
    javaSolution(`
public int lengthOfLongestSubstring(String s) {
    Set<Character> window = new HashSet<>();
    int left = 0;
    int best = 0;
    for (int right = 0; right < s.length(); right++) {
        while (window.contains(s.charAt(right))) {
            window.remove(s.charAt(left));
            left++;
        }
        window.add(s.charAt(right));
        best = Math.max(best, right - left + 1);
    }
    return best;
}`),
    pythonSolution(`
def lengthOfLongestSubstring(self, s: str) -> int:
    window = set()
    left = 0
    best = 0
    for right, char in enumerate(s):
        while char in window:
            window.remove(s[left])
            left += 1
        window.add(char)
        best = max(best, right - left + 1)
    return best`),
  ),
});
Object.assign(TEMPLATES, {
  [key('Median of Two Sorted Arrays', 'Binary Search Approach')]: variants(
    cppSolution(`
double findMedianSortedArrays(const vector<int>& nums1, const vector<int>& nums2) {
    const vector<int>* a = &nums1;
    const vector<int>* b = &nums2;
    if (a->size() > b->size()) {
        swap(a, b);
    }
    int total = static_cast<int>(a->size() + b->size());
    int half = (total + 1) / 2;
    int left = 0;
    int right = static_cast<int>(a->size());
    while (left <= right) {
        int partitionA = (left + right) / 2;
        int partitionB = half - partitionA;
        int maxLeftA = partitionA == 0 ? INT_MIN : (*a)[partitionA - 1];
        int minRightA = partitionA == static_cast<int>(a->size()) ? INT_MAX : (*a)[partitionA];
        int maxLeftB = partitionB == 0 ? INT_MIN : (*b)[partitionB - 1];
        int minRightB = partitionB == static_cast<int>(b->size()) ? INT_MAX : (*b)[partitionB];
        if (maxLeftA <= minRightB && maxLeftB <= minRightA) {
            if (total % 2 == 1) return static_cast<double>(max(maxLeftA, maxLeftB));
            return (max(maxLeftA, maxLeftB) + min(minRightA, minRightB)) / 2.0;
        }
        if (maxLeftA > minRightB) right = partitionA - 1;
        else left = partitionA + 1;
    }
    return 0.0;
}`),
    javaSolution(`
public double findMedianSortedArrays(int[] nums1, int[] nums2) {
    if (nums1.length > nums2.length) return findMedianSortedArrays(nums2, nums1);
    int total = nums1.length + nums2.length;
    int half = (total + 1) / 2;
    int left = 0;
    int right = nums1.length;
    while (left <= right) {
        int partitionA = (left + right) / 2;
        int partitionB = half - partitionA;
        int maxLeftA = partitionA == 0 ? Integer.MIN_VALUE : nums1[partitionA - 1];
        int minRightA = partitionA == nums1.length ? Integer.MAX_VALUE : nums1[partitionA];
        int maxLeftB = partitionB == 0 ? Integer.MIN_VALUE : nums2[partitionB - 1];
        int minRightB = partitionB == nums2.length ? Integer.MAX_VALUE : nums2[partitionB];
        if (maxLeftA <= minRightB && maxLeftB <= minRightA) {
            if (total % 2 == 1) return Math.max(maxLeftA, maxLeftB);
            return (Math.max(maxLeftA, maxLeftB) + Math.min(minRightA, minRightB)) / 2.0;
        }
        if (maxLeftA > minRightB) right = partitionA - 1;
        else left = partitionA + 1;
    }
    return 0.0;
}`),
    pythonSolution(`
def findMedianSortedArrays(self, nums1: List[int], nums2: List[int]) -> float:
    if len(nums1) > len(nums2):
        nums1, nums2 = nums2, nums1
    total = len(nums1) + len(nums2)
    half = (total + 1) // 2
    left, right = 0, len(nums1)
    while left <= right:
        partition_a = (left + right) // 2
        partition_b = half - partition_a
        max_left_a = nums1[partition_a - 1] if partition_a > 0 else float('-inf')
        min_right_a = nums1[partition_a] if partition_a < len(nums1) else float('inf')
        max_left_b = nums2[partition_b - 1] if partition_b > 0 else float('-inf')
        min_right_b = nums2[partition_b] if partition_b < len(nums2) else float('inf')
        if max_left_a <= min_right_b and max_left_b <= min_right_a:
            if total % 2 == 1: return float(max(max_left_a, max_left_b))
            return (max(max_left_a, max_left_b) + min(min_right_a, min_right_b)) / 2.0
        if max_left_a > min_right_b: right = partition_a - 1
        else: left = partition_a + 1
    return 0.0`),
  ),
  [key('Reverse Linked List', 'Iterative Approach')]: variants(
    cppSolution(`
vector<int> reverseList(const vector<int>& head) {
    vector<int> result;
    result.reserve(head.size());
    for (int index = static_cast<int>(head.size()) - 1; index >= 0; --index) {
        result.push_back(head[index]);
    }
    return result;
}`),
    javaSolution(`
public int[] reverseList(int[] head) {
    int[] result = Arrays.copyOf(head, head.length);
    for (int left = 0, right = result.length - 1; left < right; left++, right--) {
        int temp = result[left];
        result[left] = result[right];
        result[right] = temp;
    }
    return result;
}`),
    pythonSolution(`
def reverseList(self, head: List[int]) -> List[int]:
    return list(reversed(head))`),
  ),
  [key('Reverse Linked List', 'Recursive Approach')]: variants(
    cppSolution(`
void collectReverse(const vector<int>& head, int index, vector<int>& result) {
    if (index == static_cast<int>(head.size())) return;
    collectReverse(head, index + 1, result);
    result.push_back(head[index]);
}

vector<int> reverseList(const vector<int>& head) {
    vector<int> result;
    result.reserve(head.size());
    collectReverse(head, 0, result);
    return result;
}`),
    javaSolution(`
private void collectReverse(int[] head, int index, List<Integer> result) {
    if (index == head.length) return;
    collectReverse(head, index + 1, result);
    result.add(head[index]);
}

public int[] reverseList(int[] head) {
    List<Integer> values = new ArrayList<>();
    collectReverse(head, 0, values);
    int[] result = new int[values.size()];
    for (int i = 0; i < values.size(); i++) result[i] = values.get(i);
    return result;
}`),
    pythonSolution(`
def reverseList(self, head: List[int]) -> List[int]:
    def collect(index: int) -> List[int]:
        if index == len(head):
            return []
        return collect(index + 1) + [head[index]]
    return collect(0)`),
  ),
});
Object.assign(TEMPLATES, {
  [key('Valid Parentheses', 'Stack Approach')]: variants(
    cppSolution(`
bool isValid(const string& s) {
    unordered_map<char, char> pairs = {{')', '('}, {']', '['}, {'}', '{'}};
    vector<char> stack;
    for (char ch : s) {
        if (!pairs.count(ch)) {
            stack.push_back(ch);
            continue;
        }
        if (stack.empty() || stack.back() != pairs[ch]) return false;
        stack.pop_back();
    }
    return stack.empty();
}`),
    javaSolution(`
public boolean isValid(String s) {
    Map<Character, Character> pairs = Map.of(')', '(', ']', '[', '}', '{');
    Deque<Character> stack = new ArrayDeque<>();
    for (char ch : s.toCharArray()) {
        if (!pairs.containsKey(ch)) {
            stack.push(ch);
            continue;
        }
        if (stack.isEmpty() || stack.pop() != pairs.get(ch)) return false;
    }
    return stack.isEmpty();
}`),
    pythonSolution(`
def isValid(self, s: str) -> bool:
    pairs = {')': '(', ']': '[', '}': '{'}
    stack = []
    for char in s:
        if char not in pairs:
            stack.append(char)
            continue
        if not stack or stack.pop() != pairs[char]:
            return False
    return not stack`),
  ),
  [key('Merge Two Sorted Lists', 'Iterative Approach')]: variants(
    cppSolution(`
vector<int> mergeTwoLists(const vector<int>& list1, const vector<int>& list2) {
    vector<int> result;
    int i = 0, j = 0;
    while (i < static_cast<int>(list1.size()) && j < static_cast<int>(list2.size())) {
        if (list1[i] <= list2[j]) result.push_back(list1[i++]);
        else result.push_back(list2[j++]);
    }
    while (i < static_cast<int>(list1.size())) result.push_back(list1[i++]);
    while (j < static_cast<int>(list2.size())) result.push_back(list2[j++]);
    return result;
}`),
    javaSolution(`
public int[] mergeTwoLists(int[] list1, int[] list2) {
    int[] result = new int[list1.length + list2.length];
    int i = 0, j = 0, index = 0;
    while (i < list1.length && j < list2.length) {
        if (list1[i] <= list2[j]) result[index++] = list1[i++];
        else result[index++] = list2[j++];
    }
    while (i < list1.length) result[index++] = list1[i++];
    while (j < list2.length) result[index++] = list2[j++];
    return result;
}`),
    pythonSolution(`
def mergeTwoLists(self, list1: List[int], list2: List[int]) -> List[int]:
    result = []
    i = 0
    j = 0
    while i < len(list1) and j < len(list2):
        if list1[i] <= list2[j]:
            result.append(list1[i])
            i += 1
        else:
            result.append(list2[j])
            j += 1
    result.extend(list1[i:])
    result.extend(list2[j:])
    return result`),
  ),
  [key('Maximum Subarray', "Kadane's Algorithm")]: variants(
    cppSolution(`
int maxSubArray(const vector<int>& nums) {
    int current = nums[0];
    int best = nums[0];
    for (int i = 1; i < static_cast<int>(nums.size()); ++i) {
        current = max(nums[i], current + nums[i]);
        best = max(best, current);
    }
    return best;
}`),
    javaSolution(`
public int maxSubArray(int[] nums) {
    int current = nums[0];
    int best = nums[0];
    for (int i = 1; i < nums.length; i++) {
        current = Math.max(nums[i], current + nums[i]);
        best = Math.max(best, current);
    }
    return best;
}`),
    pythonSolution(`
def maxSubArray(self, nums: List[int]) -> int:
    current = nums[0]
    best = nums[0]
    for value in nums[1:]:
        current = max(value, current + value)
        best = max(best, current)
    return best`),
  ),
  [key('Best Time to Buy and Sell Stock', 'One Pass Approach')]: variants(
    cppSolution(`
int maxProfit(const vector<int>& prices) {
    int minPrice = INT_MAX;
    int best = 0;
    for (int price : prices) {
        minPrice = min(minPrice, price);
        best = max(best, price - minPrice);
    }
    return best;
}`),
    javaSolution(`
public int maxProfit(int[] prices) {
    int minPrice = Integer.MAX_VALUE;
    int best = 0;
    for (int price : prices) {
        minPrice = Math.min(minPrice, price);
        best = Math.max(best, price - minPrice);
    }
    return best;
}`),
    pythonSolution(`
def maxProfit(self, prices: List[int]) -> int:
    min_price = float('inf')
    best = 0
    for price in prices:
        min_price = min(min_price, price)
        best = max(best, price - min_price)
    return best`),
  ),
  [key('Contains Duplicate', 'Hash Set Approach')]: variants(
    cppSolution(`
bool containsDuplicate(const vector<int>& nums) {
    unordered_set<int> seen;
    for (int value : nums) {
        if (!seen.insert(value).second) return true;
    }
    return false;
}`),
    javaSolution(`
public boolean containsDuplicate(int[] nums) {
    Set<Integer> seen = new HashSet<>();
    for (int value : nums) {
        if (!seen.add(value)) return true;
    }
    return false;
}`),
    pythonSolution(`
def containsDuplicate(self, nums: List[int]) -> bool:
    seen = set()
    for value in nums:
        if value in seen:
            return True
        seen.add(value)
    return False`),
  ),
});
Object.assign(TEMPLATES, {
  [key('Product of Array Except Self', 'Two Pass Approach')]: variants(
    cppSolution(`
vector<int> productExceptSelf(const vector<int>& nums) {
    vector<int> result(nums.size(), 1);
    int prefix = 1;
    for (int i = 0; i < static_cast<int>(nums.size()); ++i) {
        result[i] = prefix;
        prefix *= nums[i];
    }
    int suffix = 1;
    for (int i = static_cast<int>(nums.size()) - 1; i >= 0; --i) {
        result[i] *= suffix;
        suffix *= nums[i];
    }
    return result;
}`),
    javaSolution(`
public int[] productExceptSelf(int[] nums) {
    int[] result = new int[nums.length];
    int prefix = 1;
    for (int i = 0; i < nums.length; i++) {
        result[i] = prefix;
        prefix *= nums[i];
    }
    int suffix = 1;
    for (int i = nums.length - 1; i >= 0; i--) {
        result[i] *= suffix;
        suffix *= nums[i];
    }
    return result;
}`),
    pythonSolution(`
def productExceptSelf(self, nums: List[int]) -> List[int]:
    result = [1] * len(nums)
    prefix = 1
    for i, value in enumerate(nums):
        result[i] = prefix
        prefix *= value
    suffix = 1
    for i in range(len(nums) - 1, -1, -1):
        result[i] *= suffix
        suffix *= nums[i]
    return result`),
  ),
  [key('3Sum', 'Two Pointers Approach')]: variants(
    cppSolution(`
vector<vector<int>> threeSum(vector<int> nums) {
    sort(nums.begin(), nums.end());
    vector<vector<int>> result;
    for (int i = 0; i < static_cast<int>(nums.size()); ++i) {
        if (i > 0 && nums[i] == nums[i - 1]) continue;
        int left = i + 1;
        int right = static_cast<int>(nums.size()) - 1;
        while (left < right) {
            int total = nums[i] + nums[left] + nums[right];
            if (total == 0) {
                result.push_back({nums[i], nums[left], nums[right]});
                ++left;
                --right;
                while (left < right && nums[left] == nums[left - 1]) ++left;
                while (left < right && nums[right] == nums[right + 1]) --right;
            } else if (total < 0) {
                ++left;
            } else {
                --right;
            }
        }
    }
    return result;
}`),
    javaSolution(`
public List<List<Integer>> threeSum(int[] nums) {
    Arrays.sort(nums);
    List<List<Integer>> result = new ArrayList<>();
    for (int i = 0; i < nums.length; i++) {
        if (i > 0 && nums[i] == nums[i - 1]) continue;
        int left = i + 1;
        int right = nums.length - 1;
        while (left < right) {
            int total = nums[i] + nums[left] + nums[right];
            if (total == 0) {
                result.add(Arrays.asList(nums[i], nums[left], nums[right]));
                left++;
                right--;
                while (left < right && nums[left] == nums[left - 1]) left++;
                while (left < right && nums[right] == nums[right + 1]) right--;
            } else if (total < 0) left++;
            else right--;
        }
    }
    return result;
}`),
    pythonSolution(`
def threeSum(self, nums: List[int]) -> List[List[int]]:
    nums.sort()
    result = []
    for i, value in enumerate(nums):
        if i > 0 and value == nums[i - 1]:
            continue
        left, right = i + 1, len(nums) - 1
        while left < right:
            total = value + nums[left] + nums[right]
            if total == 0:
                result.append([value, nums[left], nums[right]])
                left += 1
                right -= 1
                while left < right and nums[left] == nums[left - 1]:
                    left += 1
                while left < right and nums[right] == nums[right + 1]:
                    right -= 1
            elif total < 0:
                left += 1
            else:
                right -= 1
    return result`),
  ),
  [key('Group Anagrams', 'Sorted String Key Approach')]: variants(
    cppSolution(`
vector<vector<string>> groupAnagrams(const vector<string>& strs) {
    unordered_map<string, vector<string>> groups;
    for (const string& value : strs) {
        string signature = value;
        sort(signature.begin(), signature.end());
        groups[signature].push_back(value);
    }
    vector<vector<string>> result;
    for (auto& entry : groups) result.push_back(entry.second);
    return result;
}`),
    javaSolution(`
public List<List<String>> groupAnagrams(String[] strs) {
    Map<String, List<String>> groups = new HashMap<>();
    for (String value : strs) {
        char[] chars = value.toCharArray();
        Arrays.sort(chars);
        String signature = new String(chars);
        groups.computeIfAbsent(signature, ignored -> new ArrayList<>()).add(value);
    }
    return new ArrayList<>(groups.values());
}`),
    pythonSolution(`
def groupAnagrams(self, strs: List[str]) -> List[List[str]]:
    groups = defaultdict(list)
    for value in strs:
        groups[''.join(sorted(value))].append(value)
    return list(groups.values())`),
  ),
  [key('Binary Tree Inorder Traversal', 'Recursive Approach')]: variants(
    cppSolution(`
void dfs(const vector<optional<int>>& root, int index, vector<int>& result) {
    if (index >= static_cast<int>(root.size()) || !root[index].has_value()) return;
    dfs(root, index * 2 + 1, result);
    result.push_back(*root[index]);
    dfs(root, index * 2 + 2, result);
}

vector<int> inorderTraversal(const vector<optional<int>>& root) {
    vector<int> result;
    dfs(root, 0, result);
    return result;
}`),
    javaSolution(`
private void dfs(List<Integer> root, int index, List<Integer> result) {
    if (index >= root.size() || root.get(index) == null) return;
    dfs(root, index * 2 + 1, result);
    result.add(root.get(index));
    dfs(root, index * 2 + 2, result);
}

public int[] inorderTraversal(List<Integer> root) {
    List<Integer> result = new ArrayList<>();
    dfs(root, 0, result);
    int[] values = new int[result.size()];
    for (int i = 0; i < result.size(); i++) values[i] = result.get(i);
    return values;
}`),
    pythonSolution(`
def inorderTraversal(self, root: List[Optional[int]]) -> List[int]:
    result: List[int] = []
    def dfs(index: int) -> None:
        if index >= len(root) or root[index] is None:
            return
        dfs(index * 2 + 1)
        result.append(root[index])
        dfs(index * 2 + 2)
    dfs(0)
    return result`),
  ),
});
Object.assign(TEMPLATES, {
  [key('Design HashMap', 'Array-based Approach')]: variants(
    cppSolution(`
class MyHashMap {
private:
    vector<int> data;
public:
    MyHashMap() : data(1000001, -1) {}
    void put(int key, int value) { data[key] = value; }
    int get(int key) { return data[key]; }
    void remove(int key) { data[key] = -1; }
};

string trim(const string& value) {
    size_t start = value.find_first_not_of(" \t\n\r");
    if (start == string::npos) return "";
    size_t end = value.find_last_not_of(" \t\n\r");
    return value.substr(start, end - start + 1);
}

string unsupportedPrivateProblem(const string& rawInput) {
    MyHashMap hashMap;
    vector<string> outputs;
    string command;
    stringstream stream(rawInput);
    while (getline(stream, command, ';')) {
        command = trim(command);
        if (command.empty()) continue;
        string action;
        stringstream line(command);
        line >> action;
        if (action == "put") {
            int key = 0, value = 0;
            line >> key >> value;
            hashMap.put(key, value);
        } else if (action == "get") {
            int key = 0;
            line >> key;
            outputs.push_back(to_string(hashMap.get(key)));
        } else if (action == "remove") {
            int key = 0;
            line >> key;
            hashMap.remove(key);
        }
    }
    string result;
    for (size_t i = 0; i < outputs.size(); ++i) {
        if (i > 0) result += ",";
        result += outputs[i];
    }
    return result;
}`),
    javaSolution(`
private static class MyHashMap {
    private final int[] data = new int[1_000_001];
    MyHashMap() { Arrays.fill(data, -1); }
    void put(int key, int value) { data[key] = value; }
    int get(int key) { return data[key]; }
    void remove(int key) { data[key] = -1; }
}

public String unsupportedPrivateProblem(String rawInput) {
    MyHashMap hashMap = new MyHashMap();
    List<String> outputs = new ArrayList<>();
    for (String command : rawInput.split(";")) {
        String trimmed = command.trim();
        if (trimmed.isEmpty()) continue;
        String[] parts = trimmed.split("\\s+");
        switch (parts[0]) {
            case "put": hashMap.put(Integer.parseInt(parts[1]), Integer.parseInt(parts[2])); break;
            case "get": outputs.add(String.valueOf(hashMap.get(Integer.parseInt(parts[1])))); break;
            case "remove": hashMap.remove(Integer.parseInt(parts[1])); break;
            default: break;
        }
    }
    return String.join(",", outputs);
}`),
    pythonSolution(`
def unsupportedPrivateProblem(self, rawInput: str) -> str:
    data = [-1] * 1_000_001
    outputs: List[str] = []
    for command in rawInput.split(';'):
        parts = command.strip().split()
        if not parts:
            continue
        if parts[0] == 'put':
            data[int(parts[1])] = int(parts[2])
        elif parts[0] == 'get':
            outputs.append(str(data[int(parts[1])]))
        elif parts[0] == 'remove':
            data[int(parts[1])] = -1
    return ','.join(outputs)`),
  ),
  [key('Maximum Depth of Binary Tree', 'Recursive DFS')]: variants(
    cppSolution(`
int dfs(const vector<optional<int>>& root, int index) {
    if (index >= static_cast<int>(root.size()) || !root[index].has_value()) return 0;
    return 1 + max(dfs(root, index * 2 + 1), dfs(root, index * 2 + 2));
}

int maxDepth(const vector<optional<int>>& root) {
    return dfs(root, 0);
}`),
    javaSolution(`
private int dfs(List<Integer> root, int index) {
    if (index >= root.size() || root.get(index) == null) return 0;
    return 1 + Math.max(dfs(root, index * 2 + 1), dfs(root, index * 2 + 2));
}

public int maxDepth(List<Integer> root) {
    return dfs(root, 0);
}`),
    pythonSolution(`
def maxDepth(self, root: List[Optional[int]]) -> int:
    def dfs(index: int) -> int:
        if index >= len(root) or root[index] is None:
            return 0
        return 1 + max(dfs(index * 2 + 1), dfs(index * 2 + 2))
    return dfs(0)`),
  ),
});
Object.assign(TEMPLATES, {
  [key('Palindrome Number', 'Reverse Half Approach')]: variants(
    cppSolution(`
bool isPalindrome(int x) {
    if (x < 0 || (x % 10 == 0 && x != 0)) return false;
    int reversedHalf = 0;
    while (x > reversedHalf) {
        reversedHalf = reversedHalf * 10 + x % 10;
        x /= 10;
    }
    return x == reversedHalf || x == reversedHalf / 10;
}`),
    javaSolution(`
public boolean isPalindrome(int x) {
    if (x < 0 || (x % 10 == 0 && x != 0)) return false;
    int reversedHalf = 0;
    while (x > reversedHalf) {
        reversedHalf = reversedHalf * 10 + x % 10;
        x /= 10;
    }
    return x == reversedHalf || x == reversedHalf / 10;
}`),
    pythonSolution(`
def isPalindrome(self, x: int) -> bool:
    if x < 0 or (x % 10 == 0 and x != 0):
        return False
    reversed_half = 0
    while x > reversed_half:
        reversed_half = reversed_half * 10 + x % 10
        x //= 10
    return x == reversed_half or x == reversed_half // 10`),
  ),
  [key('Path Sum', 'DFS Approach')]: variants(
    cppSolution(`
bool dfs(const vector<optional<int>>& root, int index, int remaining) {
    if (index >= static_cast<int>(root.size()) || !root[index].has_value()) return false;
    remaining -= *root[index];
    int left = index * 2 + 1;
    int right = index * 2 + 2;
    bool isLeaf = (left >= static_cast<int>(root.size()) || !root[left].has_value()) && (right >= static_cast<int>(root.size()) || !root[right].has_value());
    if (isLeaf) return remaining == 0;
    return dfs(root, left, remaining) || dfs(root, right, remaining);
}

bool hasPathSum(const vector<optional<int>>& root, int targetSum) {
    return dfs(root, 0, targetSum);
}`),
    javaSolution(`
private boolean dfs(List<Integer> root, int index, int remaining) {
    if (index >= root.size() || root.get(index) == null) return false;
    remaining -= root.get(index);
    int left = index * 2 + 1;
    int right = index * 2 + 2;
    boolean isLeaf = (left >= root.size() || root.get(left) == null) && (right >= root.size() || root.get(right) == null);
    if (isLeaf) return remaining == 0;
    return dfs(root, left, remaining) || dfs(root, right, remaining);
}

public boolean hasPathSum(List<Integer> root, int targetSum) {
    return dfs(root, 0, targetSum);
}`),
    pythonSolution(`
def hasPathSum(self, root: List[Optional[int]], targetSum: int) -> bool:
    def dfs(index: int, remaining: int) -> bool:
        if index >= len(root) or root[index] is None:
            return False
        remaining -= root[index]
        left = index * 2 + 1
        right = index * 2 + 2
        is_leaf = (left >= len(root) or root[left] is None) and (right >= len(root) or root[right] is None)
        if is_leaf:
            return remaining == 0
        return dfs(left, remaining) or dfs(right, remaining)
    return dfs(0, targetSum)`),
  ),
  [key('Remove Duplicates from Sorted Array', 'Two Pointers Approach')]: variants(
    cppSolution(`
int removeDuplicates(vector<int>& nums) {
    if (nums.empty()) return 0;
    int writeIndex = 1;
    for (int readIndex = 1; readIndex < static_cast<int>(nums.size()); ++readIndex) {
        if (nums[readIndex] != nums[writeIndex - 1]) nums[writeIndex++] = nums[readIndex];
    }
    return writeIndex;
}`),
    javaSolution(`
public int removeDuplicates(int[] nums) {
    if (nums.length == 0) return 0;
    int writeIndex = 1;
    for (int readIndex = 1; readIndex < nums.length; readIndex++) {
        if (nums[readIndex] != nums[writeIndex - 1]) nums[writeIndex++] = nums[readIndex];
    }
    return writeIndex;
}`),
    pythonSolution(`
def removeDuplicates(self, nums: List[int]) -> int:
    if not nums:
        return 0
    write_index = 1
    for read_index in range(1, len(nums)):
        if nums[read_index] != nums[write_index - 1]:
            nums[write_index] = nums[read_index]
            write_index += 1
    return write_index`),
  ),
  [key('Same Tree', 'Recursive Approach')]: variants(
    cppSolution(`
bool same(const vector<optional<int>>& p, int i, const vector<optional<int>>& q, int j) {
    bool missingP = i >= static_cast<int>(p.size()) || !p[i].has_value();
    bool missingQ = j >= static_cast<int>(q.size()) || !q[j].has_value();
    if (missingP || missingQ) return missingP == missingQ;
    if (*p[i] != *q[j]) return false;
    return same(p, i * 2 + 1, q, j * 2 + 1) && same(p, i * 2 + 2, q, j * 2 + 2);
}

bool isSameTree(const vector<optional<int>>& p, const vector<optional<int>>& q) {
    return same(p, 0, q, 0);
}`),
    javaSolution(`
private boolean same(List<Integer> p, int i, List<Integer> q, int j) {
    boolean missingP = i >= p.size() || p.get(i) == null;
    boolean missingQ = j >= q.size() || q.get(j) == null;
    if (missingP || missingQ) return missingP == missingQ;
    if (!Objects.equals(p.get(i), q.get(j))) return false;
    return same(p, i * 2 + 1, q, j * 2 + 1) && same(p, i * 2 + 2, q, j * 2 + 2);
}

public boolean isSameTree(List<Integer> p, List<Integer> q) {
    return same(p, 0, q, 0);
}`),
    pythonSolution(`
def isSameTree(self, p: List[Optional[int]], q: List[Optional[int]]) -> bool:
    def same(i: int, j: int) -> bool:
        missing_p = i >= len(p) or p[i] is None
        missing_q = j >= len(q) or q[j] is None
        if missing_p or missing_q:
            return missing_p == missing_q
        if p[i] != q[j]:
            return False
        return same(i * 2 + 1, j * 2 + 1) and same(i * 2 + 2, j * 2 + 2)
    return same(0, 0)`),
  ),
});
Object.assign(TEMPLATES, {
  [key('Symmetric Tree', 'Recursive Approach')]: variants(
    cppSolution(`
bool mirror(const vector<optional<int>>& root, int left, int right) {
    bool missingLeft = left >= static_cast<int>(root.size()) || !root[left].has_value();
    bool missingRight = right >= static_cast<int>(root.size()) || !root[right].has_value();
    if (missingLeft || missingRight) return missingLeft == missingRight;
    if (*root[left] != *root[right]) return false;
    return mirror(root, left * 2 + 1, right * 2 + 2) && mirror(root, left * 2 + 2, right * 2 + 1);
}

bool isSymmetric(const vector<optional<int>>& root) {
    if (root.empty() || !root[0].has_value()) return true;
    return mirror(root, 1, 2);
}`),
    javaSolution(`
private boolean mirror(List<Integer> root, int left, int right) {
    boolean missingLeft = left >= root.size() || root.get(left) == null;
    boolean missingRight = right >= root.size() || root.get(right) == null;
    if (missingLeft || missingRight) return missingLeft == missingRight;
    if (!Objects.equals(root.get(left), root.get(right))) return false;
    return mirror(root, left * 2 + 1, right * 2 + 2) && mirror(root, left * 2 + 2, right * 2 + 1);
}

public boolean isSymmetric(List<Integer> root) {
    if (root.isEmpty() || root.get(0) == null) return true;
    return mirror(root, 1, 2);
}`),
    pythonSolution(`
def isSymmetric(self, root: List[Optional[int]]) -> bool:
    def mirror(left: int, right: int) -> bool:
        missing_left = left >= len(root) or root[left] is None
        missing_right = right >= len(root) or root[right] is None
        if missing_left or missing_right:
            return missing_left == missing_right
        if root[left] != root[right]:
            return False
        return mirror(left * 2 + 1, right * 2 + 2) and mirror(left * 2 + 2, right * 2 + 1)
    if not root or root[0] is None:
        return True
    return mirror(1, 2)`),
  ),
  [key('Climbing Stairs', 'Dynamic Programming')]: variants(
    cppSolution(`
int climbStairs(int n) {
    if (n <= 2) return n;
    int first = 1;
    int second = 2;
    for (int step = 3; step <= n; ++step) {
        int next = first + second;
        first = second;
        second = next;
    }
    return second;
}`),
    javaSolution(`
public int climbStairs(int n) {
    if (n <= 2) return n;
    int first = 1;
    int second = 2;
    for (int step = 3; step <= n; step++) {
        int next = first + second;
        first = second;
        second = next;
    }
    return second;
}`),
    pythonSolution(`
def climbStairs(self, n: int) -> int:
    if n <= 2:
        return n
    first, second = 1, 2
    for _ in range(3, n + 1):
        first, second = second, first + second
    return second`),
  ),
  [key('Roman to Integer', 'Right to Left Approach')]: variants(
    cppSolution(`
int romanToInt(const string& s) {
    unordered_map<char, int> values = {{'I', 1}, {'V', 5}, {'X', 10}, {'L', 50}, {'C', 100}, {'D', 500}, {'M', 1000}};
    int result = 0;
    int previous = 0;
    for (int index = static_cast<int>(s.size()) - 1; index >= 0; --index) {
        int current = values[s[index]];
        if (current < previous) result -= current;
        else {
            result += current;
            previous = current;
        }
    }
    return result;
}`),
    javaSolution(`
public int romanToInt(String s) {
    Map<Character, Integer> values = Map.of('I', 1, 'V', 5, 'X', 10, 'L', 50, 'C', 100, 'D', 500, 'M', 1000);
    int result = 0;
    int previous = 0;
    for (int index = s.length() - 1; index >= 0; index--) {
        int current = values.get(s.charAt(index));
        if (current < previous) result -= current;
        else {
            result += current;
            previous = current;
        }
    }
    return result;
}`),
    pythonSolution(`
def romanToInt(self, s: str) -> int:
    values = {'I': 1, 'V': 5, 'X': 10, 'L': 50, 'C': 100, 'D': 500, 'M': 1000}
    result = 0
    previous = 0
    for char in reversed(s):
        current = values[char]
        if current < previous:
            result -= current
        else:
            result += current
            previous = current
    return result`),
  ),
  [key('Roman to Integer', 'Two Stack Approach')]: variants(
    cppSolution(`
string unsupportedPrivateProblem(const string& rawInput) {
    unordered_map<char, int> values = {{'I', 1}, {'V', 5}, {'X', 10}, {'L', 50}, {'C', 100}, {'D', 500}, {'M', 1000}};
    stack<int> input;
    stack<int> output;
    for (char ch : rawInput) input.push(values[ch]);
    while (!input.empty()) {
        output.push(input.top());
        input.pop();
    }
    int total = 0;
    int previous = 0;
    while (!output.empty()) {
        int current = output.top();
        output.pop();
        if (current < previous) total -= current;
        else {
            total += current;
            previous = current;
        }
    }
    return to_string(total);
}`),
    javaSolution(`
public String unsupportedPrivateProblem(String rawInput) {
    Map<Character, Integer> values = Map.of('I', 1, 'V', 5, 'X', 10, 'L', 50, 'C', 100, 'D', 500, 'M', 1000);
    Deque<Integer> input = new ArrayDeque<>();
    Deque<Integer> output = new ArrayDeque<>();
    for (char ch : rawInput.toCharArray()) input.push(values.get(ch));
    while (!input.isEmpty()) output.push(input.pop());
    int total = 0;
    int previous = 0;
    while (!output.isEmpty()) {
        int current = output.pop();
        if (current < previous) total -= current;
        else {
            total += current;
            previous = current;
        }
    }
    return String.valueOf(total);
}`),
    pythonSolution(`
def unsupportedPrivateProblem(self, rawInput: str) -> str:
    values = {'I': 1, 'V': 5, 'X': 10, 'L': 50, 'C': 100, 'D': 500, 'M': 1000}
    input_stack = [values[ch] for ch in rawInput]
    output_stack = []
    while input_stack:
        output_stack.append(input_stack.pop())
    total = 0
    previous = 0
    while output_stack:
        current = output_stack.pop()
        if current < previous:
            total -= current
        else:
            total += current
            previous = current
    return str(total)`),
  ),
  [key('test', 'test')]: variants(
    cppSolution(`
int echoValue(int value) {
    return value;
}`),
    javaSolution(`
public int echoValue(int value) {
    return value;
}`),
    pythonSolution(`
def echoValue(self, value: int) -> int:
    return value`),
  ),
});
async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const result = await client.query(`
    select sa.id as approach_id, p.title as problem_title, sa.title as approach_title, sa.code_variants
    from public.problems p
    join public.solutions s on s.problem_id = p.id
    join public.solution_approaches sa on sa.solution_id = s.id
    order by p.created_at asc, sa.order asc
  `);

  const unresolved = [];
  const updates = [];

  for (const row of result.rows) {
    const template = TEMPLATES[key(row.problem_title, row.approach_title)];
    if (!template) {
      unresolved.push({
        approachId: row.approach_id,
        problemTitle: row.problem_title,
        approachTitle: row.approach_title,
      });
      continue;
    }

    const current = Array.isArray(row.code_variants) ? row.code_variants : [];
    if (current.length > 0) {
      continue;
    }

    updates.push({
      approachId: row.approach_id,
      codeVariants: template,
    });
  }

  if (unresolved.length > 0) {
    console.error(JSON.stringify({ unresolved }, null, 2));
    await client.end();
    process.exit(1);
  }

  if (!APPLY) {
    console.log(JSON.stringify({
      mode: 'dry-run',
      totalRows: result.rows.length,
      updates: updates.length,
      templates: Object.keys(TEMPLATES).length,
    }, null, 2));
    await client.end();
    return;
  }

  await client.query('begin');
  try {
    for (const update of updates) {
      await client.query(
        `
          update public.solution_approaches
          set code_variants = $1::jsonb,
              updated_at = now()
          where id = $2
        `,
        [JSON.stringify(update.codeVariants), update.approachId],
      );
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }

  console.log(JSON.stringify({
    mode: 'apply',
    updated: updates.length,
    templates: Object.keys(TEMPLATES).length,
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
