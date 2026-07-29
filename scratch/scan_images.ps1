Add-Type -AssemblyName System.Drawing
[void][System.Reflection.Assembly]::LoadWithPartialName("System.Drawing")

$code = @"
using System;
using System.IO;
using System.Threading.Tasks;
using Windows.Globalization;
using Windows.Graphics.Imaging;
using Windows.Media.Ocr;
using Windows.Storage;

public class OcrHelper {
    public static async Task<string> RecognizeAsync(string filePath) {
        StorageFile file = await StorageFile.GetFileFromPathAsync(filePath);
        using (var stream = await file.OpenAsync(FileAccessMode.Read)) {
            BitmapDecoder decoder = await BitmapDecoder.CreateAsync(stream);
            SoftwareBitmap bitmap = await decoder.GetSoftwareBitmapAsync();
            OcrEngine engine = OcrEngine.TryCreateFromUserProfileLanguage();
            OcrResult result = await engine.RecognizeAsync(bitmap);
            return result.Text;
        }
    }
}
"@

Add-Type -TypeDefinition $code -Language CSharp -IgnoreWarnings

$files = Get-ChildItem "C:\Users\DELL\Desktop\ooo\ooo_ads_new\ooo ads\*.png"
foreach ($f in $files) {
    try {
        $task = [OcrHelper]::RecognizeAsync($f.FullName)
        $task.Wait()
        $text = $task.Result -replace "\s+", " "
        Write-Host "$($f.Name) | $text"
    } catch {
        Write-Host "$($f.Name) | ERROR: $_"
    }
}
