document.getElementById('save-skin').addEventListener('click', () => {
    const xSkin = document.getElementById('x-skin').value;
    const oSkin = document.getElementById('o-skin').value;
    const boardTheme = document.getElementById('board-theme').value;

    // Lưu vào localStorage
    localStorage.setItem('xSkin', xSkin);
    localStorage.setItem('oSkin', oSkin);
    localStorage.setItem('boardTheme', boardTheme);

    // Thông báo lưu thành công
    alert('Đã lưu tùy chỉnh skin và chủ đề!');
    window.location.href = '/';
});