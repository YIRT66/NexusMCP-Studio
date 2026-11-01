param([string]$ReadyFile)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$form=New-Object Windows.Forms.Form
$form.Text='HanCode UIA Fixture ' + $PID
$form.ShowInTaskbar=$false
$form.StartPosition='Manual'
$form.Location=New-Object Drawing.Point(-2000,-2000)
$form.Size=New-Object Drawing.Size(360,240)
$edit=New-Object Windows.Forms.TextBox
$edit.Name='FixtureInput';$edit.AccessibleName='Fixture input';$edit.Text='initial information'
$edit.Location=New-Object Drawing.Point(10,10)
$password=New-Object Windows.Forms.TextBox
$password.AccessibleName='Fixture password';$password.UseSystemPasswordChar=$true;$password.Text='fixture-secret-do-not-return'
$password.Location=New-Object Drawing.Point(10,45)
$button=New-Object Windows.Forms.Button
$button.Text='Apply fixture';$button.AccessibleName='Apply fixture';$button.Location=New-Object Drawing.Point(10,80)
$label=New-Object Windows.Forms.Label
$label.Text='Before action';$label.AutoSize=$true;$label.Location=New-Object Drawing.Point(10,120)
$button.Add_Click({$label.Text=$edit.Text})
$form.Controls.AddRange(@($edit,$password,$button,$label))
$form.Add_Shown({[IO.File]::WriteAllText($ReadyFile,(@{handle=$form.Handle.ToInt64().ToString();pid=$PID}|ConvertTo-Json -Compress))})
[Windows.Forms.Application]::Run($form)
