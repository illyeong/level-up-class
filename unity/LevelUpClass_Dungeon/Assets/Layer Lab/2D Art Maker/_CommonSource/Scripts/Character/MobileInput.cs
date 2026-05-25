namespace LayerLab.ArtMaker
{
    public static class MobileInput
    {
        public static float horizontal      = 0f;
        public static bool  isMovingButton  = false; // 이동 버튼 누르는 중이면 true
        public static bool  isJoystickActive = false; // 조이스틱 터치 중이면 true
        public static bool  isAttackPressed = false; // 전용 공격 버튼 눌렸으면 true (1프레임)
    }
}
