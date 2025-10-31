#include <iostream>
#include <vector>
#include <unordered_map>
using namespace std;

vector<int> twoSum(vector<int> &nums, int target)
{
    unordered_map<int, int> seen;
    for (int i = 0; i < nums.size(); i++)
    {
        int complement = target - nums[i];
        if (seen.count(complement))
        {
            return {seen[complement], i};
        }
        seen[nums[i]] = i;
    }
    return {};
}

int main()
{
    int n;
    cin >> n;
    vector<int> nums(n);
    for (int i = 0; i < n; i++)
    {
        cin >> nums[i];
    }

    int target;
    cin >> target;

    vector<int> result = twoSum(nums, target);
    cout << "[" << result[0] << "," << result[1] << "]";

    return 0;
}
